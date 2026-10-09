import { useState } from 'react'
import type { FormEvent } from 'react'
import { MessageSquarePlus, Paperclip } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Pill, Select, Skeleton, Textarea, useToast } from '../../components/ui'
import { formatDate, formatShortDate } from '../../lib/dates'
import { SERVICE_REQUEST_STATUS } from '../../lib/labels'
import { formatINR } from '../../lib/money'
import { useCan } from '../../lib/permissions'
import { useCurrentProfile, useProjects, useServiceRequests, useSubmitServiceRequest } from '../../lib/queries'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export default function RequestsPage() {
  const requests = useServiceRequests()

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-[1.6rem] leading-tight">Requests</h1>
      <NewRequestForm />

      <section aria-labelledby="past-requests" className="flex flex-col gap-3">
        <h2 id="past-requests" className="text-[1.2rem]">
          Past requests
        </h2>
        {requests.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        ) : requests.isError ? (
          <QueryError what="your requests" onRetry={() => requests.refetch()} />
        ) : requests.data.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="You haven't asked for anything yet"
            description="Need extra work outside your plan? Send a request above and we'll send you a quote."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {[...requests.data]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((request) => {
                const status = SERVICE_REQUEST_STATUS[request.status]
                return (
                  <li key={request.id} className="flex flex-col gap-1.5 rounded-card border border-rule bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="leading-snug font-medium">{request.title}</p>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    {request.description && <p className="text-ink-muted">{request.description}</p>}
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                      <span>Sent {formatDate(request.created_at)}</span>
                      {request.desired_date && <span>Wanted by {formatShortDate(request.desired_date)}</span>}
                      {request.quote_amount_minor !== null && (
                        <span className="font-mono text-ink">Quote {formatINR(request.quote_amount_minor)}</span>
                      )}
                      {request.attachment_names.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Icon icon={Paperclip} size={14} />
                          {request.attachment_names.join(', ')}
                        </span>
                      )}
                    </p>
                  </li>
                )
              })}
          </ul>
        )}
      </section>
    </div>
  )
}

function NewRequestForm() {
  const toast = useToast()
  const { data: profile } = useCurrentProfile()
  const projects = useProjects()
  const submit = useSubmitServiceRequest()
  const canCreate = useCan('service_request', 'create', { clientId: profile?.client_id ?? undefined })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [desiredDate, setDesiredDate] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string>()
  const [fileKey, setFileKey] = useState(0)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!profile?.client_id) return
    if (title.trim().length < 3) {
      setError('Give your request a short title.')
      return
    }
    setError(undefined)
    try {
      await submit.mutateAsync({
        client_id: profile.client_id,
        title: title.trim(),
        description: description.trim() || undefined,
        project_id: projectId || undefined,
        desired_date: desiredDate || undefined,
        attachment_names: files.map((file) => file.name),
      })
      toast({ title: 'Request sent', description: "We'll come back with a quote.", tone: 'ok' })
      setTitle('')
      setDescription('')
      setProjectId('')
      setDesiredDate('')
      setFiles([])
      setFileKey((key) => key + 1)
    } catch (failure) {
      toast({ title: 'Could not send your request', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <Card>
      <CardHeader title="Request something new" description="Extra work outside your plan. We reply with a quote." />
      <CardBody>
        {!canCreate && profile ? (
          <p className="text-ink-muted">Your account cannot send requests. Ask your Vernex contact.</p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <Field label="Title" required error={error}>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
            </Field>
            <Field label="Description" hint="What do you need, and what should it achieve?">
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project">
                <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">Not tied to a project</option>
                  {(projects.data ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Desired date">
                <Input type="date" value={desiredDate} onChange={(event) => setDesiredDate(event.target.value)} />
              </Field>
            </div>
            <Field label="Attachments" hint={files.length > 0 ? files.map((file) => file.name).join(', ') : 'Optional'}>
              <Input
                key={fileKey}
                type="file"
                multiple
                className="py-1.5"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={submit.isPending}>
                Send request
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  )
}
