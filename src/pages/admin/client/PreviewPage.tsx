import { ArrowLeft, Eye } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { EmptyState, Skeleton } from '../../../components/ui'
import { useCan } from '../../../lib/permissions'
import { useClient } from '../../../lib/queries'
import DashboardPage from '../../client/DashboardPage'

/** A client's dashboard exactly as they see it, with nothing clickable. */
export default function PreviewPage() {
  const { id } = useParams()
  const client = useClient(id)
  const canView = useCan('client', 'view', { clientId: id })

  if (client.isPending) return <Skeleton aria-busy="true" className="h-64 w-full" />
  if (client.isError || !canView) {
    return client.isError && !(client.error instanceof Error && 'code' in client.error && client.error.code === 'not_found') ? (
      <QueryError what="this client" onRetry={() => client.refetch()} />
    ) : (
      <EmptyState title="We can't find that client" description="It may have been deleted, or it is not assigned to you." />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-info bg-surface px-4 py-3">
        <h1 className="flex items-center gap-2 text-[1rem] font-medium">
          <Icon icon={Eye} size={16} />
          Previewing {client.data.name} as the client sees it. Read-only.
        </h1>
        <Link to={`/admin/clients/${client.data.id}`} className="inline-flex min-h-[44px] items-center gap-1 font-medium underline underline-offset-2">
          <Icon icon={ArrowLeft} size={14} />
          Back to {client.data.name}
        </Link>
      </div>
      {/* inert makes the whole preview unclickable and unfocusable: nothing here can change data. */}
      <div inert data-testid="client-preview">
        <DashboardPage previewClientId={client.data.id} />
      </div>
    </div>
  )
}
