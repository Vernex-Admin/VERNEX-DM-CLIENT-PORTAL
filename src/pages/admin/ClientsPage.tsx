import { useMemo, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { ConfirmDialog } from '../../components/admin/ConfirmDialog'
import { FormDrawer } from '../../components/admin/FormDrawer'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, EmptyState, Field, Input, Pill, Select, Skeleton, Table, useToast } from '../../components/ui'
import type { Column } from '../../components/ui'
import { clientHealth, slugify } from '../../lib/clientSummary'
import { relativeTime } from '../../lib/dates'
import { outstandingMinor } from '../../lib/invoices'
import { HEALTH_STATUS } from '../../lib/labels'
import { formatINR, toMinor } from '../../lib/money'
import { useCan } from '../../lib/permissions'
import {
  useAccountLeads,
  useActivity,
  useClients,
  useCreateClient,
  useDeleteClient,
  useInvoices,
  useProjects,
  useStaff,
} from '../../lib/queries'
import { useForm } from '../../lib/useForm'
import { HEALTH_STATUSES } from '../../types/db'
import type { Client, HealthStatus } from '../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

type Row = {
  client: Client
  health: HealthStatus | null
  lead: string | null
  leadId: string | null
  outstanding: number
  lastActivity: string | null
}

export default function ClientsPage() {
  const clients = useClients()
  const projects = useProjects()
  const invoices = useInvoices()
  const leads = useAccountLeads()
  const staff = useStaff()
  const activity = useActivity({ limit: 500 })
  const canCreate = useCan('client', 'create')

  const [query, setQuery] = useState('')
  const [health, setHealth] = useState('')
  const [lead, setLead] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Client>()

  const rows: Row[] = useMemo(() => {
    const names = Object.fromEntries((staff.data ?? []).map((person) => [person.id, person.full_name]))
    return (clients.data ?? []).map((client) => {
      const leadId = (leads.data ?? []).find((row) => row.client_id === client.id)?.user_id ?? null
      return {
        client,
        health: clientHealth((projects.data ?? []).filter((project) => project.client_id === client.id)),
        lead: leadId ? (names[leadId] ?? null) : null,
        leadId,
        outstanding: outstandingMinor((invoices.data ?? []).filter((invoice) => invoice.client_id === client.id)),
        // The feed is newest first, so the first event of a client is its latest.
        lastActivity: (activity.data ?? []).find((event) => event.client_id === client.id)?.at ?? null,
      }
    })
  }, [clients.data, projects.data, invoices.data, leads.data, staff.data, activity.data])

  const shown = rows.filter(
    (row) =>
      (!query.trim() ||
        `${row.client.name} ${row.client.industry ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())) &&
      (!health || (health === 'none' ? row.health === null : row.health === health)) &&
      (!lead || row.leadId === lead),
  )

  const loading = [clients, projects, invoices, leads, staff, activity].some((query) => query.isPending)
  const failed = [clients, projects, invoices, leads, staff, activity].find((query) => query.isError)

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Client',
      cell: ({ client }) => (
        <Link to={`/admin/clients/${client.id}`} className="inline-flex min-h-[44px] items-center lg:min-h-0 font-medium underline-offset-2 hover:underline">
          {client.name}
        </Link>
      ),
    },
    { key: 'industry', header: 'Industry', cell: ({ client }) => client.industry ?? '' },
    {
      key: 'health',
      header: 'Health',
      cell: ({ health: status }) =>
        status ? <Pill tone={HEALTH_STATUS[status].tone}>{HEALTH_STATUS[status].label}</Pill> : <span className="text-ink-muted">No projects</span>,
    },
    { key: 'lead', header: 'Account lead', cell: ({ lead: name }) => name ?? 'Unassigned' },
    { key: 'outstanding', header: 'Outstanding', align: 'right', mono: true, cell: ({ outstanding }) => formatINR(outstanding) },
    {
      key: 'activity',
      header: 'Last activity',
      cell: ({ lastActivity }) => (lastActivity ? relativeTime(lastActivity) : 'None yet'),
    },
    { key: 'actions', header: 'Actions', cell: ({ client }) => <DeleteButton client={client} onDelete={setDeleting} /> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.4rem] leading-tight">Clients</h1>
        {canCreate && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon icon={Plus} size={16} />
            New client
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Icon icon={Search} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
          <Input
            aria-label="Search clients"
            placeholder="Search by name or industry"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select aria-label="Filter by health" value={health} onChange={(event) => setHealth(event.target.value)} className="sm:w-44">
          <option value="">All health</option>
          {HEALTH_STATUSES.map((status) => (
            <option key={status} value={status}>
              {HEALTH_STATUS[status].label}
            </option>
          ))}
          <option value="none">No projects</option>
        </Select>
        <Select aria-label="Filter by account lead" value={lead} onChange={(event) => setLead(event.target.value)} className="sm:w-48">
          <option value="">All account leads</option>
          {(staff.data ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : failed ? (
        <QueryError what="your clients" onRetry={() => failed.refetch()} />
      ) : (
        <Table
          dense
          caption="Clients"
          columns={columns}
          rows={shown}
          rowKey={({ client }) => client.id}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No clients yet"
                description="Add your first client to start their projects and invoices."
                action={
                  canCreate ? (
                    <Button variant="primary" onClick={() => setCreating(true)}>
                      New client
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState icon={Search} title="No clients match" description="Try a different search or clear the filters." />
            )
          }
        />
      )}

      {creating && <NewClientDrawer onClose={() => setCreating(false)} />}
      <DeleteClientDialog client={deleting} onClose={() => setDeleting(undefined)} />
    </div>
  )
}

function DeleteButton({ client, onDelete }: { client: Client; onDelete: (client: Client) => void }) {
  const canDelete = useCan('client', 'delete', { clientId: client.id })
  if (!canDelete) return null
  return (
    <Button size="sm" variant="ghost" aria-label={`Delete ${client.name}`} onClick={() => onDelete(client)}>
      Delete
    </Button>
  )
}

/** Deleting removes the client and everything it owns, so the name must be typed. */
export function DeleteClientDialog({ client, onClose, onDeleted }: { client: Client | undefined; onClose: () => void; onDeleted?: () => void }) {
  const toast = useToast()
  const remove = useDeleteClient()
  const canDelete = useCan('client', 'delete', { clientId: client?.id })

  async function confirm() {
    if (!client || !canDelete) return
    try {
      await remove.mutateAsync(client.id)
      toast({ title: `${client.name} deleted`, tone: 'ok' })
      onClose()
      onDeleted?.()
    } catch (error) {
      toast({ title: 'Could not delete the client', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(client)}
      onClose={onClose}
      title={`Delete ${client?.name ?? 'client'}?`}
      description="This permanently deletes the client with its people, projects, deliverables, files and invoices."
      confirmLabel="Delete client"
      requireText={client?.name}
      pending={remove.isPending}
      onConfirm={confirm}
    />
  )
}

function NewClientDrawer({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateClient()
  const canCreate = useCan('client', 'create')
  const { values, set, dirty } = useForm({
    name: '',
    industry: '',
    city: '',
    gstin: '',
    billing_email: '',
    retainer: '',
    retainer_months: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const next: Record<string, string> = {}
    if (values.name.trim().length < 2) next.name = 'Enter the client name.'
    if (values.billing_email && !/^\S+@\S+\.\S+$/.test(values.billing_email)) next.billing_email = 'Enter a valid email address.'
    const retainer = values.retainer ? toMinor(values.retainer) : null
    if (retainer !== null && (Number.isNaN(retainer) || retainer < 0)) next.retainer = 'Enter an amount in rupees.'
    if (values.retainer_months && !/^[1-9]\d{0,2}$/.test(values.retainer_months)) next.retainer_months = 'Enter a number of months.'
    setErrors(next)
    if (Object.keys(next).length > 0 || !canCreate) return
    try {
      const client = await create.mutateAsync({
        name: values.name.trim(),
        slug: slugify(values.name),
        industry: values.industry.trim() || null,
        city: values.city.trim() || null,
        gstin: values.gstin.trim().toUpperCase() || null,
        billing_email: values.billing_email.trim() || null,
        retainer_minor: retainer,
        retainer_months: values.retainer_months ? Number(values.retainer_months) : null,
      })
      toast({ title: `${client.name} created`, tone: 'ok' })
      onClose()
      navigate(`/admin/clients/${client.id}`)
    } catch (error) {
      toast({ title: 'Could not create the client', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title="New client"
      description="You can add people, projects and invoices once it exists."
      dirty={dirty}
      onSubmit={submit}
      submitLabel="Create client"
      pending={create.isPending}
      submitDisabled={!canCreate}
    >
      <Field label="Name" required error={errors.name}>
        <Input value={values.name} onChange={(event) => set('name', event.target.value)} autoFocus />
      </Field>
      <Field label="Industry">
        <Input value={values.industry} onChange={(event) => set('industry', event.target.value)} />
      </Field>
      <Field label="City">
        <Input value={values.city} onChange={(event) => set('city', event.target.value)} />
      </Field>
      <Field label="GSTIN">
        <Input value={values.gstin} onChange={(event) => set('gstin', event.target.value)} />
      </Field>
      <Field label="Billing email" error={errors.billing_email}>
        <Input type="email" value={values.billing_email} onChange={(event) => set('billing_email', event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monthly retainer (₹)" error={errors.retainer}>
          <Input inputMode="decimal" value={values.retainer} onChange={(event) => set('retainer', event.target.value)} />
        </Field>
        <Field label="Retainer months" error={errors.retainer_months}>
          <Input inputMode="numeric" value={values.retainer_months} onChange={(event) => set('retainer_months', event.target.value)} />
        </Field>
      </div>
    </FormDrawer>
  )
}
