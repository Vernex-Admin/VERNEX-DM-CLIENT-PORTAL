import { useState } from 'react'
import { ArrowDown, ArrowUp, FolderKanban, Plus } from 'lucide-react'
import { ConfirmDialog } from '../../../components/admin/ConfirmDialog'
import { FormDrawer } from '../../../components/admin/FormDrawer'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, Card, CardBody, EmptyState, Field, Input, Pill, Select, Skeleton, Switch, Textarea, useToast } from '../../../components/ui'
import { formatShortDate } from '../../../lib/dates'
import { HEALTH_STATUS, MILESTONE_STATUS_LABEL, PROJECT_TYPE_LABEL } from '../../../lib/labels'
import { useCan } from '../../../lib/permissions'
import {
  useCreateMilestone,
  useCreateProject,
  useDeleteMilestone,
  useDeleteProject,
  useMilestones,
  useProjects,
  useReorderMilestones,
  useUpdateMilestone,
  useUpdateProject,
} from '../../../lib/queries'
import { useForm } from '../../../lib/useForm'
import { HEALTH_STATUSES, MILESTONE_STATUSES, PROJECT_TYPES } from '../../../types/db'
import type { HealthStatus, Milestone, MilestoneStatus, Project, ProjectType } from '../../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export function ProjectsTab({ clientId }: { clientId: string }) {
  const projects = useProjects({ client_id: clientId })
  const canCreate = useCan('project', 'create', { clientId })
  const [drawer, setDrawer] = useState<Project | 'new'>()
  const [deleting, setDeleting] = useState<Project>()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.1rem]">Projects</h2>
        {canCreate && (
          <Button variant="primary" onClick={() => setDrawer('new')}>
            <Icon icon={Plus} size={16} />
            New project
          </Button>
        )}
      </div>

      {projects.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-28 w-full" />
          ))}
        </div>
      ) : projects.isError ? (
        <QueryError what="this client's projects" onRetry={() => projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create the first project, then add milestones and deliverables to it."
          action={
            canCreate ? (
              <Button variant="primary" onClick={() => setDrawer('new')}>
                New project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.data.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} onEdit={() => setDrawer(project)} onDelete={() => setDeleting(project)} />
            </li>
          ))}
        </ul>
      )}

      {drawer && <ProjectDrawer clientId={clientId} project={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(undefined)} />}
      <DeleteProject project={deleting} onClose={() => setDeleting(undefined)} />
    </div>
  )
}

function ProjectCard({ project, onEdit, onDelete }: { project: Project; onEdit: () => void; onDelete: () => void }) {
  const clientId = project.client_id
  const canEdit = useCan('project', 'edit', { clientId })
  const canDelete = useCan('project', 'delete', { clientId })
  const canAddMilestone = useCan('milestone', 'create', { clientId })
  const [milestoneDrawer, setMilestoneDrawer] = useState<Milestone | 'new'>()
  const health = HEALTH_STATUS[project.health]

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[1.0667rem] leading-snug">{project.name}</h3>
            <p className="text-sm text-ink-muted">
              {[
                PROJECT_TYPE_LABEL[project.type],
                `${project.default_revision_limit} revisions per deliverable`,
                project.target_end_date ? `Target ${formatShortDate(project.target_end_date)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={health.tone}>{health.label}</Pill>
            {canEdit && (
              <Button size="sm" aria-label={`Edit ${project.name}`} onClick={onEdit}>
                Edit
              </Button>
            )}
            {canDelete && (
              <Button size="sm" variant="ghost" aria-label={`Delete ${project.name}`} onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>

        <Milestones project={project} onEdit={setMilestoneDrawer} />

        {canAddMilestone && (
          <div>
            <Button size="sm" onClick={() => setMilestoneDrawer('new')} aria-label={`Add milestone to ${project.name}`}>
              <Icon icon={Plus} size={14} />
              Add milestone
            </Button>
          </div>
        )}
      </CardBody>
      {milestoneDrawer && (
        <MilestoneDrawer
          project={project}
          milestone={milestoneDrawer === 'new' ? undefined : milestoneDrawer}
          onClose={() => setMilestoneDrawer(undefined)}
        />
      )}
    </Card>
  )
}

function Milestones({ project, onEdit }: { project: Project; onEdit: (milestone: Milestone) => void }) {
  const toast = useToast()
  const milestones = useMilestones(project.id)
  const reorder = useReorderMilestones()
  const remove = useDeleteMilestone()
  const canEdit = useCan('milestone', 'edit', { clientId: project.client_id })
  const canDelete = useCan('milestone', 'delete', { clientId: project.client_id })
  const [deleting, setDeleting] = useState<Milestone>()

  if (milestones.isPending) return <Skeleton className="h-16 w-full" />
  if (milestones.isError) return <QueryError what="the milestones" onRetry={() => milestones.refetch()} />
  const rows = milestones.data
  if (rows.length === 0) return <p className="text-ink-muted">No milestones yet.</p>

  async function move(index: number, by: -1 | 1) {
    const ids = rows.map((row) => row.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved as string)
    try {
      await reorder.mutateAsync({ projectId: project.id, orderedIds: ids })
    } catch (error) {
      toast({ title: 'Could not reorder the milestones', description: messageOf(error), tone: 'bad' })
    }
  }

  async function confirmDelete() {
    if (!deleting || !canDelete) return
    try {
      await remove.mutateAsync(deleting.id)
      toast({ title: `Milestone "${deleting.title}" deleted`, tone: 'ok' })
      setDeleting(undefined)
    } catch (error) {
      toast({ title: 'Could not delete the milestone', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <>
      <ol aria-label={`Milestones of ${project.name}`} className="flex flex-col divide-y divide-rule rounded-card border border-rule">
        {rows.map((milestone, index) => (
          <li key={milestone.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="w-5 font-mono text-ink-muted">{index + 1}</span>
            <span className="min-w-0 flex-1">
              {milestone.title}
              <span className="block text-sm text-ink-muted">
                {[
                  MILESTONE_STATUS_LABEL[milestone.status],
                  milestone.due_date ? `Due ${formatShortDate(milestone.due_date)}` : null,
                  milestone.invoice_trigger ? 'Raises an invoice' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="inline-flex items-center gap-0.5">
              {canEdit && (
                <>
                  <Button size="sm" variant="ghost" aria-label={`Move ${milestone.title} up`} disabled={index === 0} onClick={() => void move(index, -1)}>
                    <Icon icon={ArrowUp} size={15} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Move ${milestone.title} down`} disabled={index === rows.length - 1} onClick={() => void move(index, 1)}>
                    <Icon icon={ArrowDown} size={15} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Edit milestone ${milestone.title}`} onClick={() => onEdit(milestone)}>
                    Edit
                  </Button>
                </>
              )}
              {canDelete && (
                <Button size="sm" variant="ghost" aria-label={`Delete milestone ${milestone.title}`} onClick={() => setDeleting(milestone)}>
                  Delete
                </Button>
              )}
            </span>
          </li>
        ))}
      </ol>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={`Delete "${deleting?.title ?? 'milestone'}"?`}
        description="Deliverables under it stay, but are no longer tied to a milestone."
        confirmLabel="Delete milestone"
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}

function ProjectDrawer({ clientId, project, onClose }: { clientId: string; project: Project | undefined; onClose: () => void }) {
  const toast = useToast()
  const create = useCreateProject()
  const update = useUpdateProject()
  const can = useCan('project', project ? 'edit' : 'create', { clientId })
  const { values, set, dirty } = useForm({
    name: project?.name ?? '',
    type: (project?.type ?? 'social_media') as ProjectType,
    description: project?.description ?? '',
    health: (project?.health ?? 'on_track') as HealthStatus,
    health_reason: project?.health_reason ?? '',
    start_date: project?.start_date ?? '',
    target_end_date: project?.target_end_date ?? '',
    default_revision_limit: String(project?.default_revision_limit ?? 3),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const next: Record<string, string> = {}
    if (values.name.trim().length < 2) next.name = 'Enter a project name.'
    if (!/^\d{1,2}$/.test(values.default_revision_limit)) next.default_revision_limit = 'Enter a number from 0 to 99.'
    if (values.start_date && values.target_end_date && values.target_end_date < values.start_date) {
      next.target_end_date = 'The target end cannot be before the start.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !can) return
    const fields = {
      name: values.name.trim(),
      type: values.type,
      description: values.description.trim() || null,
      health: values.health,
      health_reason: values.health_reason.trim() || null,
      start_date: values.start_date || null,
      target_end_date: values.target_end_date || null,
      default_revision_limit: Number(values.default_revision_limit),
    }
    try {
      if (project) await update.mutateAsync({ id: project.id, patch: fields })
      else await create.mutateAsync({ client_id: clientId, ...fields })
      toast({ title: project ? 'Project saved' : `${fields.name} created`, tone: 'ok' })
      onClose()
    } catch (error) {
      toast({ title: 'Could not save the project', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={project ? `Edit ${project.name}` : 'New project'}
      dirty={dirty}
      onSubmit={submit}
      submitLabel={project ? 'Save changes' : 'Create project'}
      pending={create.isPending || update.isPending}
      submitDisabled={!can}
    >
      <Field label="Name" required error={errors.name}>
        <Input value={values.name} onChange={(event) => set('name', event.target.value)} autoFocus />
      </Field>
      <Field label="Type">
        <Select value={values.type} onChange={(event) => set('type', event.target.value as ProjectType)}>
          {PROJECT_TYPES.map((type) => (
            <option key={type} value={type}>
              {PROJECT_TYPE_LABEL[type]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description">
        <Textarea value={values.description} onChange={(event) => set('description', event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Health">
          <Select value={values.health} onChange={(event) => set('health', event.target.value as HealthStatus)}>
            {HEALTH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {HEALTH_STATUS[status].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Revisions per deliverable" hint="The default for new deliverables." error={errors.default_revision_limit}>
          <Input inputMode="numeric" value={values.default_revision_limit} onChange={(event) => set('default_revision_limit', event.target.value)} />
        </Field>
      </div>
      <Field label="Why this health?" hint="Shown to the client next to the status.">
        <Input value={values.health_reason} onChange={(event) => set('health_reason', event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date">
          <Input type="date" value={values.start_date} onChange={(event) => set('start_date', event.target.value)} />
        </Field>
        <Field label="Target end date" error={errors.target_end_date}>
          <Input type="date" value={values.target_end_date} onChange={(event) => set('target_end_date', event.target.value)} />
        </Field>
      </div>
    </FormDrawer>
  )
}

function MilestoneDrawer({ project, milestone, onClose }: { project: Project; milestone: Milestone | undefined; onClose: () => void }) {
  const toast = useToast()
  const create = useCreateMilestone()
  const update = useUpdateMilestone()
  const can = useCan('milestone', milestone ? 'edit' : 'create', { clientId: project.client_id })
  const { values, set, dirty } = useForm({
    title: milestone?.title ?? '',
    due_date: milestone?.due_date ?? '',
    status: (milestone?.status ?? 'upcoming') as MilestoneStatus,
    invoice_trigger: milestone?.invoice_trigger ?? false,
  })
  const [error, setError] = useState<string>()

  async function submit() {
    if (values.title.trim().length < 2) return setError('Enter a milestone title.')
    setError(undefined)
    if (!can) return
    const fields = {
      title: values.title.trim(),
      due_date: values.due_date || null,
      status: values.status,
      invoice_trigger: values.invoice_trigger,
    }
    try {
      if (milestone) await update.mutateAsync({ id: milestone.id, patch: fields })
      else await create.mutateAsync({ project_id: project.id, ...fields })
      toast({ title: milestone ? 'Milestone saved' : 'Milestone added', tone: 'ok' })
      onClose()
    } catch (failure) {
      toast({ title: 'Could not save the milestone', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={milestone ? 'Edit milestone' : `New milestone for ${project.name}`}
      dirty={dirty}
      onSubmit={submit}
      submitLabel={milestone ? 'Save changes' : 'Add milestone'}
      pending={create.isPending || update.isPending}
      submitDisabled={!can}
    >
      <Field label="Title" required error={error}>
        <Input value={values.title} onChange={(event) => set('title', event.target.value)} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select value={values.status} onChange={(event) => set('status', event.target.value as MilestoneStatus)}>
            {MILESTONE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {MILESTONE_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={values.due_date} onChange={(event) => set('due_date', event.target.value)} />
        </Field>
      </div>
      <Switch label="Completing this milestone raises an invoice" checked={values.invoice_trigger} onChange={(event) => set('invoice_trigger', event.target.checked)} />
    </FormDrawer>
  )
}

function DeleteProject({ project, onClose }: { project: Project | undefined; onClose: () => void }) {
  const toast = useToast()
  const remove = useDeleteProject()
  const can = useCan('project', 'delete', { clientId: project?.client_id })

  async function confirm() {
    if (!project || !can) return
    try {
      await remove.mutateAsync(project.id)
      toast({ title: `${project.name} deleted`, tone: 'ok' })
      onClose()
    } catch (error) {
      toast({ title: 'Could not delete the project', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(project)}
      onClose={onClose}
      title={`Delete ${project?.name ?? 'project'}?`}
      description="This also deletes its milestones, deliverables and revision history."
      confirmLabel="Delete project"
      requireText={project?.name}
      pending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
