import { useState } from 'react'
import { Inbox, Paperclip } from 'lucide-react'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, Card, CardBody, EmptyState, Input, Pill, Select, Skeleton, useToast } from '../../../components/ui'
import { formatDate, formatShortDate } from '../../../lib/dates'
import { SERVICE_REQUEST_STATUS } from '../../../lib/labels'
import { formatINR, toMinor, toRupeesInput } from '../../../lib/money'
import { useCan } from '../../../lib/permissions'
import { useProjects, useServiceRequests, useUpdateServiceRequest } from '../../../lib/queries'
import { SERVICE_REQUEST_STATUSES } from '../../../types/db'
import type { ServiceRequest, ServiceRequestStatus } from '../../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export function RequestsTab({ clientId }: { clientId: string }) {
  const requests = useServiceRequests({ client_id: clientId })
  const projects = useProjects({ client_id: clientId })
  const names = Object.fromEntries((projects.data ?? []).map((project) => [project.id, project.name]))

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[1.1rem]">Requests from this client</h2>
      {requests.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
      ) : requests.isError ? (
        <QueryError what="this client's requests" onRetry={() => requests.refetch()} />
      ) : requests.data.length === 0 ? (
        <EmptyState icon={Inbox} title="No requests from this client" description="Anything they ask for outside their plan shows up here." />
      ) : (
        <ul className="flex flex-col gap-3">
          {[...requests.data]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((request) => (
              <li key={request.id}>
                <RequestCard request={request} project={request.project_id ? names[request.project_id] : undefined} />
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function RequestCard({ request, project }: { request: ServiceRequest; project: string | undefined }) {
  const toast = useToast()
  const update = useUpdateServiceRequest()
  const canEdit = useCan('service_request', 'edit', { clientId: request.client_id })
  const status = SERVICE_REQUEST_STATUS[request.status]
  const [quote, setQuote] = useState(request.quote_amount_minor === null ? '' : toRupeesInput(request.quote_amount_minor))
  const [quoteError, setQuoteError] = useState<string>()

  async function change(patch: Partial<Pick<ServiceRequest, 'status' | 'quote_amount_minor'>>, done: string) {
    try {
      await update.mutateAsync({ id: request.id, patch })
      toast({ title: done, tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not update the request', description: messageOf(error), tone: 'bad' })
    }
  }

  async function saveQuote() {
    const minor = toMinor(quote)
    if (Number.isNaN(minor) || minor <= 0) return setQuoteError('Enter the quote in rupees.')
    setQuoteError(undefined)
    await change({ quote_amount_minor: minor, status: request.status === 'submitted' || request.status === 'estimating' ? 'quoted' : request.status }, 'Quote saved')
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="leading-snug font-medium">{request.title}</p>
            <p className="text-sm text-ink-muted">
              {[
                `Sent ${formatDate(request.created_at)}`,
                project,
                request.desired_date ? `Wanted by ${formatShortDate(request.desired_date)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        {request.description && <p>{request.description}</p>}
        {request.attachment_names.length > 0 && (
          <p className="flex items-center gap-1 text-sm text-ink-muted">
            <Icon icon={Paperclip} size={14} />
            {request.attachment_names.join(', ')}
          </p>
        )}
        {request.quote_amount_minor !== null && <p className="font-mono">Quote {formatINR(request.quote_amount_minor)}</p>}

        {canEdit && (
          <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Status
              <Select
                aria-label={`Status of ${request.title}`}
                value={request.status}
                onChange={(event) => void change({ status: event.target.value as ServiceRequestStatus }, 'Status changed')}
                className="w-48"
              >
                {SERVICE_REQUEST_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {SERVICE_REQUEST_STATUS[value].label}
                  </option>
                ))}
              </Select>
            </label>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void saveQuote()
              }}
              className="flex items-end gap-2"
            >
              <label className="flex flex-col gap-1 text-sm font-medium">
                Quote (₹)
                <Input
                  aria-label={`Quote for ${request.title}`}
                  inputMode="decimal"
                  value={quote}
                  onChange={(event) => setQuote(event.target.value)}
                  aria-invalid={quoteError ? true : undefined}
                  className="w-36"
                />
              </label>
              <Button type="submit" size="sm">
                Save quote
              </Button>
            </form>
            {quoteError && <p className="basis-full text-sm text-bad">{quoteError}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
