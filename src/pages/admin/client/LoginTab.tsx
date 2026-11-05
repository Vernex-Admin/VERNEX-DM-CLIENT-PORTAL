import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { CopyButton, IssueLoginDialog, PasswordText, passwordSource } from '../../../components/admin/LoginAccess'
import { QueryError } from '../../../components/QueryError'
import { Button, Card, CardBody, CardHeader, EmptyState, Pill, Skeleton, Switch, Table, useToast } from '../../../components/ui'
import type { Column } from '../../../components/ui'
import { USER_ROLE_LABEL } from '../../../lib/labels'
import { useCan } from '../../../lib/permissions'
import { useClient, useClientCredentials, useClientUsers, useUpdateClientUser } from '../../../lib/queries'
import type { ClientCredential, Profile } from '../../../types/db'

type Row = { person: Profile; credential: ClientCredential | undefined }

/** Every person of one client: their Client Code, current password and whether they can sign in. */
export function LoginTab({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  const users = useClientUsers(clientId)
  const credentials = useClientCredentials()
  const [issuing, setIssuing] = useState<Row>()

  const queries = [client, users, credentials]
  if (queries.some((query) => query.isPending)) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  const failed = queries.find((query) => query.isError)
  if (failed || !client.data) return <QueryError what="this client's logins" error={failed?.error} onRetry={() => void failed?.refetch()} />

  // Whoever signs in with the Client Code itself comes first.
  const rows: Row[] = (users.data ?? [])
    .map((person) => ({ person, credential: credentials.data?.find((row) => row.profile_id === person.id) }))
    .sort((a, b) => (a.credential?.login_code ?? '~').localeCompare(b.credential?.login_code ?? '~'))

  const columns: Column<Row>[] = [
    {
      key: 'person',
      header: 'Person',
      cell: ({ person }) => (
        <span className="flex flex-col">
          <span className="font-medium">{person.full_name}</span>
          <span className="text-sm text-ink-muted">{USER_ROLE_LABEL[person.role]}</span>
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Client Code',
      cell: ({ credential }) =>
        credential ? (
          <span className="inline-flex items-center gap-1">
            <span className="font-mono">{credential.login_code}</span>
            <CopyButton text={credential.login_code} what="Client Code" />
          </span>
        ) : (
          <span className="text-ink-muted">No login yet</span>
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
    { key: 'access', header: 'Can sign in', cell: ({ person }) => <AccessSwitch person={person} /> },
    {
      key: 'actions',
      header: 'Actions',
      cell: (row) => <IssueButton row={row} onIssue={setIssuing} />,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Client Code"
          description="Given by the system when the client was created. It cannot be changed."
          action={<Pill tone="neutral">Clients sign in with code and password only</Pill>}
        />
        <CardBody className="flex items-center gap-2">
          <span className="font-mono text-[1.4rem] font-medium">{client.data.client_code}</span>
          <CopyButton text={client.data.client_code} what="Client Code" />
        </CardBody>
      </Card>

      <Table
        dense
        caption="Logins"
        columns={columns}
        rows={rows}
        rowKey={({ person }) => person.id}
        empty={
          <EmptyState
            icon={KeyRound}
            title="No one at this client yet"
            description="Add a person from the Team tab, then set up their login here."
          />
        }
      />

      <IssueLoginDialog person={issuing?.person} credential={issuing?.credential} onClose={() => setIssuing(undefined)} />
    </div>
  )
}

function IssueButton({ row, onIssue }: { row: Row; onIssue: (row: Row) => void }) {
  const canEdit = useCan('client_access', 'edit', { clientId: row.person.client_id ?? undefined })
  if (!canEdit) return null
  return (
    <Button size="sm" variant={row.credential ? 'secondary' : 'primary'} onClick={() => onIssue(row)}>
      {row.credential ? 'New password' : 'Set up login'}
    </Button>
  )
}

/** Turning this off stops the person signing in; their history stays. */
export function AccessSwitch({ person }: { person: Profile }) {
  const toast = useToast()
  const update = useUpdateClientUser()
  const canEdit = useCan('client_user', 'edit', { clientId: person.client_id ?? undefined })

  async function toggle(next: boolean) {
    try {
      await update.mutateAsync({ id: person.id, patch: { is_active: next } })
      toast({ title: next ? `${person.full_name} can sign in again` : `${person.full_name} can no longer sign in`, tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not change access', description: error instanceof Error ? error.message : undefined, tone: 'bad' })
    }
  }

  return (
    <Switch
      label={<span className="sr-only">{`${person.full_name} can sign in`}</span>}
      checked={person.is_active}
      disabled={!canEdit}
      onChange={(event) => void toggle(event.target.checked)}
    />
  )
}
