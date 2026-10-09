import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, Paperclip, X } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { DeliverablePreview } from '../../components/DeliverablePreview'
import { Icon } from '../../components/Icon'
import { RevisionMeter } from '../../components/RevisionMeter'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  Pill,
  Select,
  Skeleton,
  Table,
  Textarea,
  useToast,
} from '../../components/ui'
import type { Column } from '../../components/ui'
import { formatDate, formatDateTime, relativeTime } from '../../lib/dates'
import { DELIVERABLE_STATUS, REVISION_STATUS_LABEL, REVISION_TYPE_LABEL } from '../../lib/labels'
import { useCan } from '../../lib/permissions'
import {
  DataError,
  useAccountLead,
  useAddComment,
  useApproveDeliverable,
  useClientUsers,
  useComments,
  useDeliverable,
  useDeliverableVersions,
  useProject,
  useRequestRevision,
  useRevisions,
  useSubmitServiceRequest,
} from '../../lib/queries'
import { REVISION_TYPES } from '../../types/db'
import type { Revision, RevisionPriority, RevisionType } from '../../types/db'

const MIN_DESCRIPTION = 20
const MAX_FILE_BYTES = 100 * 1024 * 1024
const ACCEPT = 'image/png,image/jpeg,application/pdf,video/mp4'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export default function DeliverablePage() {
  const { id } = useParams()
  const toast = useToast()
  const deliverable = useDeliverable(id)
  const versions = useDeliverableVersions(id)
  const revisions = useRevisions(id)
  const project = useProject(deliverable.data?.project_id)
  const approve = useApproveDeliverable()
  const canApprove = useCan('deliverable', 'approve', deliverable.data ? { clientId: deliverable.data.client_id } : undefined)

  const [viewing, setViewing] = useState<number | null>(null)
  const [approving, setApproving] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [revising, setRevising] = useState(false)
  const [extra, setExtra] = useState(false)

  if (deliverable.isPending) return <PageSkeleton />
  if (deliverable.error instanceof DataError && deliverable.error.code === 'not_found') {
    return (
      <div className="mx-auto max-w-md py-10">
        <EmptyState
          title="We can't find that"
          description="It may have been removed, or it belongs to someone else."
          action={
            <Link to="/approvals" className="font-medium underline">
              Back to approvals
            </Link>
          }
        />
      </div>
    )
  }
  const item = deliverable.data
  if (!item) return <PageSkeleton />

  const status = DELIVERABLE_STATUS[item.status]
  const reviewable = item.status === 'in_review'
  const atLimit = item.revisions_used >= item.revision_limit
  const shownVersion = viewing ?? item.current_version
  const version = (versions.data ?? []).find((row) => row.version === shownVersion)

  function confirmApprove() {
    approve.mutate(item?.id as string, {
      onSuccess: () => toast({ title: "Nice, approved. We'll lock this in.", tone: 'ok' }),
      onError: (error) => toast({ title: 'Could not approve', description: messageOf(error), tone: 'bad' }),
    })
    setApproving(false)
    setUnderstood(false)
  }

  const actions = !reviewable ? null : !canApprove ? (
    <p className="font-medium text-ink-muted">Your admin approves this</p>
  ) : (
    <div className="flex gap-2">
      <Button variant="success" className="flex-1" onClick={() => setApproving(true)}>
        Approve
      </Button>
      <Button className="flex-1" onClick={() => (atLimit ? setExtra(true) : setRevising(true))}>
        {atLimit ? 'Request extra revision' : 'Request revision'}
      </Button>
    </div>
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-3">
        <Link to="/approvals" className="inline-flex min-h-[44px] w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <Icon icon={ArrowLeft} size={14} />
          Approvals
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[1.6rem] leading-tight">{item.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-muted">
              <Pill tone={status.tone}>{status.label}</Pill>
              {project.data && <span>{project.data.name}</span>}
              {item.status === 'approved' && item.approved_at && <span>Approved {formatDateTime(item.approved_at)}</span>}
              {item.due_date && item.status !== 'approved' && <span>Due {formatDate(item.due_date)}</span>}
            </div>
          </div>
          {actions && <div className="max-md:hidden md:w-[360px]">{actions}</div>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {(versions.data ?? []).length > 1 && (
            <div className="w-full max-w-[220px]">
              <Field label="Version">
                <Select value={shownVersion} onChange={(event) => setViewing(Number(event.target.value))}>
                  {(versions.data ?? []).map((row) => (
                    <option key={row.id} value={row.version}>
                      v{row.version}
                      {row.version === item.current_version ? ' (latest)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {versions.isPending ? <Skeleton className="h-[320px] w-full" /> : <DeliverablePreview version={version} title={item.title} />}
          {item.caption && <p className="text-ink-muted">{item.caption}</p>}
          <Comments deliverableId={item.id} clientId={item.client_id} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Revisions" />
            <CardBody>
              <RevisionMeter used={item.revisions_used} limit={item.revision_limit} />
              {atLimit && (
                <p className="mt-3 text-sm text-ink-muted">
                  All included revisions are used. You can ask for an extra one and we&rsquo;ll send a quote.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-[1.2rem]">
          Revision history
        </h2>
        {revisions.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Table
            caption="Revision history"
            columns={historyColumns}
            rows={revisions.data ?? []}
            rowKey={(row) => row.id}
            empty={<p className="text-ink-muted">No revisions have been requested.</p>}
          />
        )}
      </section>

      {actions && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-rule bg-surface p-3 md:hidden">{actions}</div>
      )}

      <Dialog
        open={approving}
        onClose={() => {
          setApproving(false)
          setUnderstood(false)
        }}
        title={`Approve ${item.title} v${item.current_version}?`}
        description="This confirms the work meets your needs."
        footer={
          <>
            <Button onClick={() => setApproving(false)}>Cancel</Button>
            <Button variant="success" disabled={item.is_final && !understood} onClick={confirmApprove}>
              Approve
            </Button>
          </>
        }
      >
        {item.is_final ? (
          <Checkbox
            label="I understand this is final"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
        ) : (
          <p className="text-ink-muted">Approving tells the Vernex team this version is ready.</p>
        )}
      </Dialog>

      <RevisionDrawer
        open={revising}
        onClose={() => setRevising(false)}
        deliverableId={item.id}
        number={item.revisions_used + 1}
        limit={item.revision_limit}
      />

      <ExtraRevisionDialog
        open={extra}
        onClose={() => setExtra(false)}
        title={item.title}
        clientId={item.client_id}
        projectId={item.project_id}
      />

    </div>
  )
}

const historyColumns: Column<Revision>[] = [
  { key: 'date', header: 'Requested', cell: (row) => formatDate(row.submitted_at) },
  { key: 'version', header: 'On version', cell: (row) => `v${row.on_version}`, mono: true },
  { key: 'type', header: 'Type', cell: (row) => REVISION_TYPE_LABEL[row.revision_type] },
  { key: 'status', header: 'Status', cell: (row) => REVISION_STATUS_LABEL[row.status] },
  {
    key: 'turnaround',
    header: 'Turnaround',
    cell: (row) => {
      if (!row.delivered_at) return 'In progress'
      const hours = Math.round((Date.parse(row.delivered_at) - Date.parse(row.submitted_at)) / 3_600_000)
      return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} days`
    },
    align: 'right',
  },
]

function Comments({ deliverableId, clientId }: { deliverableId: string; clientId: string }) {
  const toast = useToast()
  const comments = useComments({ target_type: 'deliverable', target_id: deliverableId })
  const users = useClientUsers(clientId)
  const lead = useAccountLead(clientId)
  const add = useAddComment()
  const [body, setBody] = useState('')

  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of users.data ?? []) map.set(user.id, user.full_name)
    if (lead.data) map.set(lead.data.id, `${lead.data.full_name} (Vernex)`)
    return map
  }, [users.data, lead.data])

  function submit(event: FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text) return
    add.mutate(
      { target_type: 'deliverable', target_id: deliverableId, body: text },
      { onError: (error) => toast({ title: 'Could not post your comment', description: messageOf(error), tone: 'bad' }) },
    )
    setBody('')
  }

  return (
    <Card>
      <CardHeader title="Comments" />
      <CardBody className="flex flex-col gap-4">
        {comments.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (comments.data ?? []).length === 0 ? (
          <p className="text-ink-muted">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(comments.data ?? []).map((comment) => (
              <li key={comment.id}>
                <p className="text-sm">
                  <span className="font-medium">{names.get(comment.author_id) ?? 'Vernex team'}</span>{' '}
                  <time dateTime={comment.created_at} title={formatDateTime(comment.created_at)} className="text-ink-muted">
                    {relativeTime(comment.created_at)}
                  </time>
                </p>
                <p className="whitespace-pre-wrap">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Field label="Add a comment">
            <Textarea rows={2} value={body} onChange={(event) => setBody(event.target.value)} />
          </Field>
          <Button type="submit" className="self-end" disabled={!body.trim()}>
            Post comment
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function RevisionDrawer(props: {
  open: boolean
  onClose: () => void
  deliverableId: string
  number: number
  limit: number
}) {
  const toast = useToast()
  const request = useRequestRevision()
  const fileInput = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<RevisionType>('visual_design')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<RevisionPriority>('normal')
  const [files, setFiles] = useState<File[]>([])
  const [tried, setTried] = useState(false)
  const [fileError, setFileError] = useState<string>()

  const tooShort = description.trim().length < MIN_DESCRIPTION

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? [])
    const tooBig = picked.find((file) => file.size > MAX_FILE_BYTES)
    setFileError(tooBig ? `${tooBig.name} is over 100 MB.` : undefined)
    setFiles((current) => [...current, ...picked.filter((file) => file.size <= MAX_FILE_BYTES)])
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (tooShort) return
    request.mutate(
      {
        deliverable_id: props.deliverableId,
        description: description.trim(),
        priority,
        revision_type: type,
        attachment_names: files.map((file) => file.name),
      },
      {
        onSuccess: () => toast({ title: `Revision ${props.number} of ${props.limit} sent`, description: 'We will get back to you soon.', tone: 'ok' }),
        onError: (error) => toast({ title: 'Could not send your request', description: messageOf(error), tone: 'bad' }),
      },
    )
    props.onClose()
    setDescription('')
    setFiles([])
    setTried(false)
    setPriority('normal')
  }

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title="Request a revision"
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="revision-form">
            Send request
          </Button>
        </>
      }
    >
      <form id="revision-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="rounded-field border border-rule bg-paper px-3 py-2 text-sm">
          This will be sent as <span className="font-medium">Revision {props.number} of {props.limit}</span>.
        </p>
        <Field label="What kind of change?" required>
          <Select value={type} onChange={(event) => setType(event.target.value as RevisionType)}>
            {REVISION_TYPES.map((value) => (
              <option key={value} value={value}>
                {REVISION_TYPE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="What should change?"
          required
          hint="Be specific: what, where, how."
          error={tried && tooShort ? `Please write at least ${MIN_DESCRIPTION} characters.` : undefined}
        >
          <Textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field
          label="Priority"
          hint={priority === 'urgent' ? 'Urgent requests may affect the timeline.' : undefined}
        >
          <Select value={priority} onChange={(event) => setPriority(event.target.value as RevisionPriority)}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Screenshots or files (optional)</p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Attach files"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ''
            }}
          />
          <Button className="self-start" onClick={() => fileInput.current?.click()}>
            <Icon icon={Paperclip} size={16} />
            Add files
          </Button>
          <p className="text-sm text-ink-muted">PNG, JPG, PDF or MP4, up to 100 MB each.</p>
          {fileError && (
            <p role="alert" className="text-sm text-bad">
              {fileError}
            </p>
          )}
          {files.length > 0 && (
            <ul className="flex flex-col gap-1">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    className="inline-flex size-[32px] shrink-0 items-center justify-center rounded-card text-ink-muted hover:bg-ink/5"
                    onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}
                  >
                    <Icon icon={X} size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </Drawer>
  )
}

function ExtraRevisionDialog(props: {
  open: boolean
  onClose: () => void
  title: string
  clientId: string
  projectId: string
}) {
  const toast = useToast()
  const submitRequest = useSubmitServiceRequest()
  const [description, setDescription] = useState('')

  function send() {
    submitRequest.mutate(
      {
        client_id: props.clientId,
        project_id: props.projectId,
        title: `Extra revision: ${props.title}`,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => toast({ title: 'Request sent', description: "We'll send a quote before any extra work starts.", tone: 'ok' }),
        onError: (error) => toast({ title: 'Could not send your request', description: messageOf(error), tone: 'bad' }),
      },
    )
    props.onClose()
    setDescription('')
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Request extra revision"
      description="All included revisions are used. We'll send a quote for one more round, and nothing starts until you accept it."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={send}>
            Send request
          </Button>
        </>
      }
    >
      <Field label="What do you need changed?">
        <Textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
    </Dialog>
  )
}

function PageSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-4">
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-[320px] w-full" />
    </div>
  )
}

