import { useMemo, useState } from 'react'
import { Lock, LockOpen, Search, UserCog } from 'lucide-react'
import { Link } from 'react-router'
import { IssueLoginDialog, PasswordText, passwordSource } from '../../components/admin/LoginAccess'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, Card, EmptyState, Input, Pill, Select, Skeleton, Table, useToast } from '../../components/ui'
import type { Column } from '../../components/ui'
import { DETAILS_STATUS, detailFieldsOf, detailsStatus, requiredProgress } from '../../lib/clientDetails'
import type { DetailsStatus } from '../../lib/clientDetails'
import { useCan } from '../../lib/permissions'
import { useClientCredentials, useClients, useClientUsersOf, useSetDetailsLocked } from '../../lib/queries'
import type { Client, ClientCredential, Profile } from '../../types/db'
import { AccessSwitch } from './client/LoginTab'

type Row = {
  client: Client
  /** Who signs in with the Client Code itself; otherwise the client's admin, or anyone. */
  person: Profile | undefined
  credential: ClientCredential | undefined
  /** How many of the client's people have a login. */
  logins: number
  people: number
  status: DetailsStatus
  progress: { done: number; total: number }
}

const FILTERS = {
  '': 'Everyone',
  no_login: 'No login yet',
  waiting: 'Waiting on the client',
  submitted: 'Ready to review',
  locked: 'Locked',
  signed_out: 'Sign-in turned off',
} as const
type Filter = keyof typeof FILTERS

function matches(row: Row, filter: Filter): boolean {
  if (filter === 'no_login') return !row.credential
  if (filter === 'waiting') return row.status === 'not_started' || row.status === 'in_progress'
  if (filter === 'submitted') return row.status === 'submitted'
  if (filter === 'locked') return row.status === 'locked'
  if (filter === 'signed_out') return Boolean(row.person && !row.person.is_active)
  return true
}

export default function ClientManagementPage() {
  const clients = useClients()
  const credentials = useClientCredentials()
  const ids = useMemo(() => (clients.data ?? []).map((client) => client.id), [clients.data])
  const people = useClientUsersOf(ids)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('')
  const [issuing, setIssuing] = useState<Row>()

  const rows: Row[] = useMemo(
    () =>
      (clients.data ?? []).map((client) => {
        const team = people.data.filter((person) => person.client_id === client.id)
        const logins = (credentials.data ?? []).filter((row) => row.client_id === client.id)
        const primaryLogin = logins.find((row) => row.login_code === client.client_code)
        const person =
          team.find((candidate) => candidate.id === primaryLogin?.profile_id) ??
          team.find((candidate) => candidate.role === 'client_admin') ??
          team[0]
        return {
          client,
          person,
          credential: logins.find((row) => row.profile_id === person?.id),
          logins: logins.length,
          people: team.length,
          status: detailsStatus(client),
          progress: requiredProgress(detailFieldsOf(client), client.details ?? {}),
        }
      }),
    [clients.data, credentials.data, people.data],
  )

  const needle = query.trim().toLowerCase()
  const shown = rows.filter(
    (row) =>
      matches(row, filter) &&
      (!needle ||
        `${row.client.name} ${row.client.client_code} ${row.person?.full_name ?? ''}`.toLowerCase().includes(needle)),
  )

  const loading = clients.isPending || credentials.isPending || people.isPending
  const failed = clients.isError ? clients : credentials.isError ? credentials : people.error ? people : null

  const columns: Column<Row>[] = [
    {
      key: 'client',
      header: 'Client',
      cell: ({ client }) => (
        <span className="flex flex-col">
          <Link to={`/admin/clients/${client.id}`} className="font-medium underline-offset-2 hover:underline">
            {client.name}
          </Link>
          <span className="font-mono text-sm text-ink-muted">{client.client_code}</span>
        </span>
      ),
    },
    {
      key: 'login',
      header: 'Login',
      cell: ({ person, credential, logins, people: count }) =>
        person ? (
          <span className="flex flex-col">
            <span>{person.full_name}</span>
            <span className="text-sm text-ink-muted">
              {credential ? <span className="font-mono">{credential.login_code}</span> : 'No login yet'}
              {count > 1 ? ` · ${logins} of ${count} people can sign in` : ''}
            </span>
          </span>
        ) : (
          <span className="text-ink-muted">No people yet</span>
        ),
    },
    {
      key: 'password',
      header: 'Password',
      cell: ({ credential }) =>
        credential ? (
          <span className="flex flex-col">
            <PasswordText password={credential.password} />
            <span className="text-sm text-ink-muted">{passwordSource(credential)}</span>
          </span>
        ) : null,
    },
    {
      key: 'details',
      header: 'Details',
      cell: ({ client, status, progress }) => (
        <span className="flex flex-col items-start gap-0.5">
          <Pill tone={DETAILS_STATUS[status].tone}>{DETAILS_STATUS[status].label}</Pill>
          <Link to={`/admin/clients/${client.id}?tab=details`} className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink">
            {progress.done} of {progress.total} required
          </Link>
        </span>
      ),
    },
    { key: 'access', header: 'Can sign in', cell: ({ person }) => (person ? <AccessSwitch person={person} /> : null) },
    { key: 'actions', header: 'Actions', cell: (row) => <RowActions row={row} onIssue={setIssuing} /> },
  ]

  const count = (predicate: (row: Row) => boolean) => rows.filter(predicate).length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[1.4rem] leading-tight">Client Management</h1>
        <p className="text-ink-muted">Client Codes, logins and passwords, and each client&apos;s details from first fill-in to lock.</p>
      </div>

      {!loading && !failed && (
        <section aria-label="Summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Clients" value={rows.length} />
          <Stat label="Without a login" value={count((row) => !row.credential)} onSelect={() => setFilter('no_login')} />
          <Stat label="Waiting on the client" value={count((row) => matches(row, 'waiting'))} onSelect={() => setFilter('waiting')} />
          <Stat label="Ready to review" value={count((row) => row.status === 'submitted')} onSelect={() => setFilter('submitted')} />
          <Stat label="Details locked" value={count((row) => row.status === 'locked')} onSelect={() => setFilter('locked')} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Icon icon={Search} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
          <Input
            aria-label="Search clients"
            placeholder="Search by client, code or person"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select aria-label="Show" value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="sm:w-56">
          {Object.entries(FILTERS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      ) : failed ? (
        <QueryError what="client logins" error={failed.error} onRetry={() => void failed.refetch()} />
      ) : (
        <Table
          dense
          caption="Client logins and details"
          columns={columns}
          rows={shown}
          rowKey={({ client }) => client.id}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={UserCog}
                title="No clients yet"
                description="Create a client from the Clients page. It gets its Client Code and login straight away."
                action={
                  <Link to="/admin/clients" className="font-medium underline underline-offset-2">
                    Go to Clients
                  </Link>
                }
              />
            ) : (
              <EmptyState icon={Search} title="No clients match" description="Try a different search or filter." />
            )
          }
        />
      )}

      <IssueLoginDialog person={issuing?.person} credential={issuing?.credential} onClose={() => setIssuing(undefined)} />
    </div>
  )
}

function Stat({ label, value, onSelect }: { label: string; value: number; onSelect?: () => void }) {
  const body = (
    <>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="font-mono text-[1.5rem] leading-tight">{value}</span>
    </>
  )
  return onSelect ? (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col items-start gap-1 rounded-card border border-rule bg-surface p-3 text-left transition-colors duration-150 hover:bg-ink/5"
    >
      {body}
    </button>
  ) : (
    <Card className="flex flex-col gap-1 p-3">{body}</Card>
  )
}

function RowActions({ row, onIssue }: { row: Row; onIssue: (row: Row) => void }) {
  const toast = useToast()
  const setLocked = useSetDetailsLocked()
  const clientId = row.client.id
  const canIssue = useCan('client_access', 'edit', { clientId })
  const canLock = useCan('client_details', 'lock', { clientId })
  const locked = row.status === 'locked'

  async function toggleLock() {
    try {
      await setLocked.mutateAsync({ clientId, locked: !locked })
      toast({ title: locked ? `${row.client.name} unlocked` : `${row.client.name} locked`, tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not change the lock', description: error instanceof Error ? error.message : undefined, tone: 'bad' })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {canIssue &&
        (row.person ? (
          <Button size="sm" variant={row.credential ? 'secondary' : 'primary'} onClick={() => onIssue(row)}>
            {row.credential ? 'New password' : 'Set up login'}
          </Button>
        ) : (
          <Link
            to={`/admin/clients/${clientId}?tab=team`}
            className="inline-flex min-h-[30px] items-center rounded px-2 text-sm font-medium text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            Add a person
          </Link>
        ))}
      {canLock && (
        <Button
          size="sm"
          variant="ghost"
          loading={setLocked.isPending}
          aria-label={locked ? `Unlock ${row.client.name} details` : `Lock ${row.client.name} details`}
          onClick={() => void toggleLock()}
        >
          <Icon icon={locked ? LockOpen : Lock} size={14} />
          {locked ? 'Unlock' : 'Lock'}
        </Button>
      )}
    </div>
  )
}
