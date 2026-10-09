import { useState } from 'react'
import { Plus, Layers } from 'lucide-react'
import { ConfirmDialog } from '../../../components/admin/ConfirmDialog'
import { FormDrawer } from '../../../components/admin/FormDrawer'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, EmptyState, Field, Input, Pill, Select, Skeleton, Switch, Table, Textarea, useToast } from '../../../components/ui'
import type { Column } from '../../../components/ui'
import { formatShortDate } from '../../../lib/dates'
import { previewKindOf, toDrivePreview } from '../../../lib/drive'
import { DELIVERABLE_KIND_LABEL, DELIVERABLE_STATUS } from '../../../lib/labels'
import { useCan } from '../../../lib/permissions'
import {
  useCreateDeliverable,
  useDeleteDeliverable,
  useDeliverables,
  useGrantBonusRevision,
  useMilestones,
  useProjects,
  usePublishVersion,
  useUpdateDeliverable,
} from '../../../lib/queries'
import { useForm } from '../../../lib/useForm'
import { DELIVERABLE_KINDS } from '../../../types/db'
import type { Deliverable, DeliverableKind, Project, Visibility } from '../../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

const VISIBILITY_LABEL: Record<Visibility, string> = { internal: 'Internal', client: 'Client visible' }

type Drawer = { kind: 'edit'; deliverable?: Deliverable } | { kind: 'publish' | 'bonus'; deliverable: Deliverable }

export function DeliverablesTab({ clientId }: { clientId: string }) {
  const deliverables = useDeliverables({ client_id: clientId })
  const projects = useProjects({ client_id: clientId })
  const canCreate = useCan('deliverable', 'create', { clientId })
  const [drawer, setDrawer] = useState<Drawer>()
  const [deleting, setDeleting] = useState<Deliverable>()

  const projectList = projects.data ?? []
  const names = Object.fromEntries(projectList.map((project) => [project.id, project.name]))

  const columns: Column<Deliverable>[] = [
    { key: 'title', header: 'Deliverable', cell: (row) => <span className="font-medium">{row.title}</span> },
    { key: 'project', header: 'Project', cell: (row) => names[row.project_id] ?? '' },
    { key: 'kind', header: 'Kind', cell: (row) => DELIVERABLE_KIND_LABEL[row.kind] },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <Pill tone={DELIVERABLE_STATUS[row.status].tone}>{DELIVERABLE_STATUS[row.status].label}</Pill>,
    },
    {
      key: 'visibility',
      header: 'Visibility',
      cell: (row) => <Pill tone={row.visibility === 'client' ? 'info' : 'neutral'}>{VISIBILITY_LABEL[row.visibility]}</Pill>,
    },
    { key: 'version', header: 'Version', mono: true, cell: (row) => `v${row.current_version}` },
    { key: 'revisions', header: 'Revisions', mono: true, cell: (row) => `${row.revisions_used}/${row.revision_limit}` },
    { key: 'due', header: 'Due', cell: (row) => (row.due_date ? formatShortDate(row.due_date) : '') },
    {
      key: 'actions',
      header: 'Actions',
      cell: (row) => (
        <RowActions
          deliverable={row}
          onEdit={() => setDrawer({ kind: 'edit', deliverable: row })}
          onPublish={() => setDrawer({ kind: 'publish', deliverable: row })}
          onBonus={() => setDrawer({ kind: 'bonus', deliverable: row })}
          onDelete={() => setDeleting(row)}
        />
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.1rem]">Deliverables</h2>
        {canCreate && (
          <Button variant="primary" disabled={projectList.length === 0} onClick={() => setDrawer({ kind: 'edit' })}>
            <Icon icon={Plus} size={16} />
            New deliverable
          </Button>
        )}
      </div>

      {deliverables.isPending || projects.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : deliverables.isError ? (
        <QueryError what="this client's deliverables" onRetry={() => deliverables.refetch()} />
      ) : (
        <Table
          dense
          caption="Deliverables"
          columns={columns}
          rows={deliverables.data}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Layers}
              title="No deliverables yet"
              description={
                projectList.length === 0
                  ? 'Create a project first, then add its deliverables here.'
                  : 'Add a deliverable, upload its first version, and send it to the client.'
              }
              action={
                canCreate && projectList.length > 0 ? (
                  <Button variant="primary" onClick={() => setDrawer({ kind: 'edit' })}>
                    New deliverable
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      {drawer?.kind === 'edit' && (
        <DeliverableDrawer clientId={clientId} projects={projectList} deliverable={drawer.deliverable} onClose={() => setDrawer(undefined)} />
      )}
      {drawer?.kind === 'publish' && <PublishDrawer deliverable={drawer.deliverable} onClose={() => setDrawer(undefined)} />}
      {drawer?.kind === 'bonus' && <BonusDrawer deliverable={drawer.deliverable} onClose={() => setDrawer(undefined)} />}
      <DeleteDeliverable deliverable={deleting} onClose={() => setDeleting(undefined)} />
    </div>
  )
}

function RowActions({
  deliverable,
  onEdit,
  onPublish,
  onBonus,
  onDelete,
}: {
  deliverable: Deliverable
  onEdit: () => void
  onPublish: () => void
  onBonus: () => void
  onDelete: () => void
}) {
  const clientId = deliverable.client_id
  const canEdit = useCan('deliverable', 'edit', { clientId })
  const canBonus = useCan('revision', 'edit', { clientId })
  const canDelete = useCan('deliverable', 'delete', { clientId })
  const title = deliverable.title
  return (
    <span className="inline-flex flex-wrap gap-1">
      {canEdit && (
        <>
          <Button size="sm" variant="ghost" aria-label={`Edit ${title}`} onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Publish version of ${title}`} onClick={onPublish}>
            Publish version
          </Button>
        </>
      )}
      {canBonus && (
        <Button size="sm" variant="ghost" aria-label={`Bonus revision for ${title}`} onClick={onBonus}>
          Bonus revision
        </Button>
      )}
      {canDelete && (
        <Button size="sm" variant="ghost" aria-label={`Delete ${title}`} onClick={onDelete}>
          Delete
        </Button>
      )}
    </span>
  )
}

function DeliverableDrawer({
  clientId,
  projects,
  deliverable,
  onClose,
}: {
  clientId: string
  projects: Project[]
  deliverable: Deliverable | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateDeliverable()
  const update = useUpdateDeliverable()
  const can = useCan('deliverable', deliverable ? 'edit' : 'create', { clientId })
  const { values, set, dirty } = useForm({
    project_id: deliverable?.project_id ?? projects[0]?.id ?? '',
    title: deliverable?.title ?? '',
    kind: (deliverable?.kind ?? 'post') as DeliverableKind,
    milestone_id: deliverable?.milestone_id ?? '',
    due_date: deliverable?.due_date ?? '',
    revision_limit: String(deliverable?.revision_limit ?? projects[0]?.default_revision_limit ?? 3),
    visibility: (deliverable?.visibility ?? 'internal') as Visibility,
    platform: deliverable?.platform ?? '',
    caption: deliverable?.caption ?? '',
    is_final: deliverable?.is_final ?? false,
    bulk_approvable: deliverable?.bulk_approvable ?? false,
  })
  const milestones = useMilestones(values.project_id || undefined)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const next: Record<string, string> = {}
    if (values.title.trim().length < 2) next.title = 'Enter a title.'
    if (!values.project_id) next.project_id = 'Choose a project.'
    if (!/^\d{1,2}$/.test(values.revision_limit)) next.revision_limit = 'Enter a number from 0 to 99.'
    setErrors(next)
    if (Object.keys(next).length > 0 || !can) return
    const fields = {
      title: values.title.trim(),
      kind: values.kind,
      milestone_id: values.milestone_id || null,
      due_date: values.due_date || null,
      revision_limit: Number(values.revision_limit),
      visibility: values.visibility,
      platform: values.platform.trim() || null,
      caption: values.caption.trim() || null,
      is_final: values.is_final,
      bulk_approvable: values.bulk_approvable,
    }
    try {
      if (deliverable) await update.mutateAsync({ id: deliverable.id, patch: fields })
      else await create.mutateAsync({ project_id: values.project_id, ...fields })
      toast({ title: deliverable ? 'Deliverable saved' : `${fields.title} created`, tone: 'ok' })
      onClose()
    } catch (error) {
      toast({ title: 'Could not save the deliverable', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={deliverable ? `Edit ${deliverable.title}` : 'New deliverable'}
      dirty={dirty}
      onSubmit={submit}
      submitLabel={deliverable ? 'Save changes' : 'Create deliverable'}
      pending={create.isPending || update.isPending}
      submitDisabled={!can}
    >
      <Field label="Project" required error={errors.project_id}>
        <Select
          value={values.project_id}
          disabled={Boolean(deliverable)}
          onChange={(event) => {
            set('project_id', event.target.value)
            set('milestone_id', '')
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" required error={errors.title}>
        <Input value={values.title} onChange={(event) => set('title', event.target.value)} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={values.kind} onChange={(event) => set('kind', event.target.value as DeliverableKind)}>
            {DELIVERABLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {DELIVERABLE_KIND_LABEL[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Milestone">
          <Select value={values.milestone_id} onChange={(event) => set('milestone_id', event.target.value)}>
            <option value="">None</option>
            {(milestones.data ?? []).map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={values.due_date} onChange={(event) => set('due_date', event.target.value)} />
        </Field>
        <Field label="Revision limit" error={errors.revision_limit}>
          <Input inputMode="numeric" value={values.revision_limit} onChange={(event) => set('revision_limit', event.target.value)} />
        </Field>
      </div>
      <Field label="Visibility" hint="Internal work is hidden from the client until you make it client visible.">
        <Select value={values.visibility} onChange={(event) => set('visibility', event.target.value as Visibility)}>
          <option value="internal">Internal: only Vernex sees it</option>
          <option value="client">Client visible</option>
        </Select>
      </Field>
      <Field label="Platform" hint="For content, e.g. instagram.">
        <Input value={values.platform} onChange={(event) => set('platform', event.target.value)} />
      </Field>
      <Field label="Caption">
        <Textarea value={values.caption} onChange={(event) => set('caption', event.target.value)} />
      </Field>
      <Switch label="Final-stage work (asks the client to confirm)" checked={values.is_final} onChange={(event) => set('is_final', event.target.checked)} />
      <Switch label="Can be approved in bulk" checked={values.bulk_approvable} onChange={(event) => set('bulk_approvable', event.target.checked)} />
    </FormDrawer>
  )
}

function PublishDrawer({ deliverable, onClose }: { deliverable: Deliverable; onClose: () => void }) {
  const toast = useToast()
  const publish = usePublishVersion()
  const can = useCan('deliverable', 'edit', { clientId: deliverable.client_id })
  const { values, set, dirty } = useForm({
    source: 'upload' as 'upload' | 'drive',
    link: '',
    visibility: deliverable.visibility,
  })
  const [file, setFile] = useState<File>()
  const [error, setError] = useState<string>()

  async function submit() {
    setError(undefined)
    let input: { preview_kind: 'image' | 'pdf' | 'video' | 'drive'; preview_url: string }
    if (values.source === 'drive') {
      const url = toDrivePreview(values.link)
      if (!url) return setError('Paste a Google Drive or Google Docs share link.')
      input = { preview_kind: 'drive', preview_url: url }
    } else {
      if (!file) return setError('Choose a file to upload.')
      const kind = previewKindOf(file.type)
      if (!kind) return setError('Upload an image, a PDF or a video. For anything else, use a Google Drive link.')
      input = { preview_kind: kind, preview_url: URL.createObjectURL(file) }
    }
    if (!can) return
    try {
      await publish.mutateAsync({ id: deliverable.id, input: { ...input, visibility: values.visibility } })
      toast({
        title: `Version ${deliverable.current_version + 1} published`,
        description: values.visibility === 'client' ? 'The client has been asked to review it.' : 'Only Vernex can see it for now.',
        tone: 'ok',
      })
      onClose()
    } catch (failure) {
      toast({ title: 'Could not publish', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={`Publish a new version of ${deliverable.title}`}
      description={`This becomes version ${deliverable.current_version + 1}.`}
      dirty={dirty || Boolean(file)}
      onSubmit={submit}
      submitLabel="Publish"
      pending={publish.isPending}
      submitDisabled={!can}
    >
      <Field label="Source">
        <Select value={values.source} onChange={(event) => set('source', event.target.value as 'upload' | 'drive')}>
          <option value="upload">Upload a file</option>
          <option value="drive">Google Drive link</option>
        </Select>
      </Field>
      {values.source === 'upload' ? (
        <Field label="File" required hint="An image, a PDF or a video." error={error}>
          <Input type="file" className="py-1.5" onChange={(event) => setFile(event.target.files?.[0])} />
        </Field>
      ) : (
        <Field label="Google Drive link" required hint="The file must be shared so the client can open it." error={error}>
          <Input type="url" value={values.link} onChange={(event) => set('link', event.target.value)} autoFocus />
        </Field>
      )}
      <Field label="Visibility" hint="Client visible sends it to the client for review straight away.">
        <Select value={values.visibility} onChange={(event) => set('visibility', event.target.value as Visibility)}>
          <option value="internal">Internal: only Vernex sees it</option>
          <option value="client">Client visible: ask for review</option>
        </Select>
      </Field>
    </FormDrawer>
  )
}

function BonusDrawer({ deliverable, onClose }: { deliverable: Deliverable; onClose: () => void }) {
  const toast = useToast()
  const grant = useGrantBonusRevision()
  const can = useCan('revision', 'edit', { clientId: deliverable.client_id })
  const { values, set, dirty } = useForm({ reason: '' })
  const [error, setError] = useState<string>()

  async function submit() {
    if (values.reason.trim().length < 5) return setError('Give a reason for the bonus revision.')
    setError(undefined)
    if (!can) return
    try {
      await grant.mutateAsync({ deliverable_id: deliverable.id, reason: values.reason.trim(), current_limit: deliverable.revision_limit })
      toast({ title: 'Bonus revision added', description: `${deliverable.title} now has ${deliverable.revision_limit + 1} revisions.`, tone: 'ok' })
      onClose()
    } catch (failure) {
      toast({ title: 'Could not add the bonus revision', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={`Bonus revision for ${deliverable.title}`}
      description={`Raises the limit from ${deliverable.revision_limit} to ${deliverable.revision_limit + 1}. The reason is logged.`}
      dirty={dirty}
      onSubmit={submit}
      submitLabel="Add bonus revision"
      pending={grant.isPending}
      submitDisabled={!can}
    >
      <Field label="Reason" required error={error}>
        <Textarea value={values.reason} onChange={(event) => set('reason', event.target.value)} autoFocus />
      </Field>
    </FormDrawer>
  )
}

function DeleteDeliverable({ deliverable, onClose }: { deliverable: Deliverable | undefined; onClose: () => void }) {
  const toast = useToast()
  const remove = useDeleteDeliverable()
  const can = useCan('deliverable', 'delete', { clientId: deliverable?.client_id })

  async function confirm() {
    if (!deliverable || !can) return
    try {
      await remove.mutateAsync(deliverable.id)
      toast({ title: `${deliverable.title} deleted`, tone: 'ok' })
      onClose()
    } catch (error) {
      toast({ title: 'Could not delete the deliverable', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(deliverable)}
      onClose={onClose}
      title={`Delete ${deliverable?.title ?? 'deliverable'}?`}
      description="Its versions and revision history are deleted too."
      confirmLabel="Delete deliverable"
      pending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
