import { useState } from 'react'
import { ArrowLeft, Eye } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { InlineField } from '../../../components/admin/InlineField'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, Card, CardBody, CardHeader, EmptyState, Skeleton, Tabs, useToast } from '../../../components/ui'
import { formatDate } from '../../../lib/dates'
import { formatINR, toMinor, toRupeesInput } from '../../../lib/money'
import { useCan } from '../../../lib/permissions'
import { useClient, useUpdateClient } from '../../../lib/queries'
import type { Client, Update } from '../../../types/db'
import { DeleteClientDialog } from '../ClientsPage'
import { DeliverablesTab } from './DeliverablesTab'
import { InvoicesTab } from './InvoicesTab'
import { ProjectsTab } from './ProjectsTab'
import { RequestsTab } from './RequestsTab'
import { TeamTab } from './TeamTab'

const TAB_IDS = ['overview', 'team', 'projects', 'deliverables', 'requests', 'invoices'] as const
type TabId = (typeof TAB_IDS)[number]

export default function ClientPage() {
  const { id } = useParams()
  const client = useClient(id)
  const [params, setParams] = useSearchParams()
  const canPreview = useCan('client', 'view', { clientId: id })
  const requested = params.get('tab')
  const tab: TabId = TAB_IDS.find((candidate) => candidate === requested) ?? 'overview'

  if (client.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (client.isError) {
    const missing = client.error instanceof Error && 'code' in client.error && client.error.code === 'not_found'
    return missing ? (
      <EmptyState
        title="We can't find that client"
        description="It may have been deleted, or it is not assigned to you."
        action={
          <Link to="/admin/clients" className="inline-flex min-h-[44px] items-center lg:min-h-0 font-medium underline underline-offset-2">
            Back to clients
          </Link>
        }
      />
    ) : (
      <QueryError what="this client" onRetry={() => client.refetch()} />
    )
  }

  const data = client.data
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link to="/admin/clients" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-ink-muted hover:text-ink lg:min-h-0">
          <Icon icon={ArrowLeft} size={14} />
          Clients
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[1.4rem] leading-tight">{data.name}</h1>
            <p className="text-ink-muted">{[data.industry, data.city].filter(Boolean).join(' · ')}</p>
          </div>
          {canPreview && (
            <Link
              to={`/admin/clients/${data.id}/preview`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-rule lg:min-h-[36px] bg-surface px-4 font-medium transition-colors duration-150 hover:bg-ink/5"
            >
              <Icon icon={Eye} size={16} />
              Preview as client
            </Link>
          )}
        </div>
      </div>

      <Tabs
        label="Client sections"
        value={tab}
        onValueChange={(next) => setParams(next === 'overview' ? {} : { tab: next })}
        items={[
          { id: 'overview', label: 'Overview', content: <Overview client={data} /> },
          { id: 'team', label: 'Team', content: <TeamTab clientId={data.id} /> },
          { id: 'projects', label: 'Projects', content: <ProjectsTab clientId={data.id} /> },
          { id: 'deliverables', label: 'Deliverables', content: <DeliverablesTab clientId={data.id} /> },
          { id: 'requests', label: 'Requests', content: <RequestsTab clientId={data.id} /> },
          { id: 'invoices', label: 'Invoices', content: <InvoicesTab clientId={data.id} /> },
        ]}
      />
    </div>
  )
}

function Overview({ client }: { client: Client }) {
  const toast = useToast()
  const update = useUpdateClient()
  const canEdit = useCan('client', 'edit', { clientId: client.id })
  const canDelete = useCan('client', 'delete', { clientId: client.id })
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  // One save path for every field: update at once, roll back and say so if it fails.
  const save = (patch: Update<Client>, what: string) => async () => {
    try {
      await update.mutateAsync({ id: client.id, patch })
      toast({ title: `${what} saved`, tone: 'ok' })
    } catch (error) {
      toast({ title: `Could not save ${what.toLowerCase()}`, description: error instanceof Error ? error.message : undefined, tone: 'bad' })
      throw error
    }
  }
  const text = (key: 'name' | 'industry' | 'city' | 'gstin' | 'billing_email', what: string) => (next: string) =>
    save({ [key]: next || null } as Update<Client>, what)()

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Details" description={canEdit ? 'Click the pencil to edit a detail.' : undefined} />
        <CardBody>
          <dl>
            <InlineField label="Name" value={client.name} canEdit={canEdit} validate={(v) => (v.length < 2 ? 'Enter the client name.' : undefined)} onSave={(next) => save({ name: next }, 'Name')()} />
            <InlineField label="Industry" value={client.industry ?? ''} canEdit={canEdit} onSave={text('industry', 'Industry')} />
            <InlineField label="City" value={client.city ?? ''} canEdit={canEdit} onSave={text('city', 'City')} />
            <InlineField label="GSTIN" value={client.gstin ?? ''} canEdit={canEdit} onSave={(next) => save({ gstin: next.toUpperCase() || null }, 'GSTIN')()} />
            <InlineField
              label="Billing email"
              type="email"
              value={client.billing_email ?? ''}
              canEdit={canEdit}
              validate={(v) => (v && !/^\S+@\S+\.\S+$/.test(v) ? 'Enter a valid email address.' : undefined)}
              onSave={text('billing_email', 'Billing email')}
            />
            <InlineField
              label="Monthly retainer (₹)"
              type="number"
              value={client.retainer_minor === null ? '' : formatINR(client.retainer_minor)}
              editValue={client.retainer_minor === null ? '' : toRupeesInput(client.retainer_minor)}
              canEdit={canEdit}
              validate={(v) => (v && (Number.isNaN(toMinor(v)) || toMinor(v) < 0) ? 'Enter an amount in rupees.' : undefined)}
              onSave={(next) => save({ retainer_minor: next ? toMinor(next) : null }, 'Retainer')()}
            />
            <InlineField
              label="Retainer months"
              type="number"
              value={client.retainer_months === null ? '' : String(client.retainer_months)}
              canEdit={canEdit}
              validate={(v) => (v && !/^[1-9]\d{0,2}$/.test(v) ? 'Enter a number of months.' : undefined)}
              onSave={(next) => save({ retainer_months: next ? Number(next) : null }, 'Retainer months')()}
            />
            <div className="flex gap-4 py-2.5">
              <dt className="w-44 shrink-0 text-sm text-ink-muted">Client since</dt>
              <dd>{formatDate(client.created_at)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {canDelete && (
        <Card>
          <CardHeader title="Delete client" description="Removes the client with all its people, work and invoices. This cannot be undone." />
          <CardBody>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete {client.name}
            </Button>
          </CardBody>
        </Card>
      )}
      <DeleteClientDialog
        client={deleting ? client : undefined}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate('/admin/clients')}
      />
    </div>
  )
}
