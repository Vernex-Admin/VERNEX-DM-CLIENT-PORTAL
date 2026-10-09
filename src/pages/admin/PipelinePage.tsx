import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { GripVertical, Plus, SquareKanban, Upload } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { FormDrawer } from '../../components/admin/FormDrawer'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, EmptyState, Field, Input, Pill, Select, Skeleton, Textarea, useToast } from '../../components/ui'
import { guessMapping, LEAD_FIELDS, parseCsv, rowsToLeads } from '../../lib/csv'
import { cn } from '../../lib/cn'
import { formatDateTime, formatShortDate, relativeTime } from '../../lib/dates'
import { isOverdue, STAGE_LABEL } from '../../lib/leads'
import { formatINR, toMinor, toRupeesInput } from '../../lib/money'
import { useCan } from '../../lib/permissions'
import { useConvertLead, useCreateLead, useImportLeads, useLeadActivity, useLeads, useUpdateLead } from '../../lib/queries'
import type { LeadInsert } from '../../lib/queries'
import { useForm } from '../../lib/useForm'
import { LEAD_STAGES, LEAD_TIERS } from '../../types/db'
import type { Lead, LeadStage, LeadTier } from '../../types/db'
import type { ColumnMapping, LeadFieldKey } from '../../lib/csv'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export default function PipelinePage() {
  const toast = useToast()
  const leads = useLeads()
  const update = useUpdateLead()
  const canCreate = useCan('lead', 'create')
  const canEdit = useCan('lead', 'edit')
  const [open, setOpen] = useState<Lead | 'new'>()
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState<Lead>()

  // A small movement starts a drag, so a plain click still opens the lead.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const byStage = useMemo(() => {
    const groups = new Map<LeadStage, Lead[]>(LEAD_STAGES.map((stage) => [stage, []]))
    for (const lead of leads.data ?? []) groups.get(lead.stage)?.push(lead)
    return groups
  }, [leads.data])

  async function move(id: string, stage: LeadStage) {
    const lead = leads.data?.find((row) => row.id === id)
    if (!lead || lead.stage === stage || !canEdit) return
    try {
      await update.mutateAsync({ id, patch: { stage } })
      toast({ title: `${lead.company} moved to ${STAGE_LABEL[stage]}`, tone: 'ok' })
    } catch (error) {
      toast({ title: `Could not move ${lead.company}`, description: messageOf(error), tone: 'bad' })
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(undefined)
    if (event.over) void move(String(event.active.id), event.over.id as LeadStage)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.4rem] leading-tight">Pipeline</h1>
        <div className="flex gap-2">
          {canCreate && (
            <>
              <Button onClick={() => setImporting(true)}>
                <Icon icon={Upload} size={16} />
                Import CSV
              </Button>
              <Button variant="primary" onClick={() => setOpen('new')}>
                <Icon icon={Plus} size={16} />
                New lead
              </Button>
            </>
          )}
        </div>
      </div>

      {leads.isPending ? (
        <div aria-busy="true" className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((column) => (
            <div key={column} className="flex w-64 shrink-0 flex-col gap-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : leads.isError ? (
        <QueryError what="the pipeline" onRetry={() => leads.refetch()} />
      ) : leads.data.length === 0 ? (
        <EmptyState
          icon={SquareKanban}
          title="Your pipeline is empty"
          description="Add a lead, or import a CSV of prospects to start working them."
          action={
            canCreate ? (
              <Button variant="primary" onClick={() => setOpen('new')}>
                New lead
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(event: DragStartEvent) => setDragging(leads.data.find((lead) => lead.id === event.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(undefined)}
        >
          <div role="list" aria-label="Pipeline stages" className="flex items-start gap-3 overflow-x-auto pb-3">
            {LEAD_STAGES.map((stage) => (
              <Column key={stage} stage={stage} leads={byStage.get(stage) ?? []} canDrag={canEdit} onOpen={setOpen} />
            ))}
          </div>
          <DragOverlay>{dragging ? <CardBody lead={dragging} /> : null}</DragOverlay>
        </DndContext>
      )}

      {open && <LeadDrawer lead={open === 'new' ? undefined : open} onClose={() => setOpen(undefined)} />}
      {importing && <ImportDrawer onClose={() => setImporting(false)} />}
    </div>
  )
}

function Column({ stage, leads, canDrag, onOpen }: { stage: LeadStage; leads: Lead[]; canDrag: boolean; onOpen: (lead: Lead) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage, disabled: !canDrag })
  return (
    <div
      role="listitem"
      aria-label={`${STAGE_LABEL[stage]}, ${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`}
      className="flex w-64 shrink-0 flex-col gap-2"
    >
      <h2 className="flex items-center justify-between px-1 text-sm font-medium">
        {STAGE_LABEL[stage]}
        <span className="font-mono text-ink-muted">{leads.length}</span>
      </h2>
      <ul
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-col gap-2 rounded-card border border-dashed p-1.5',
          isOver ? 'border-ink bg-ink/5' : 'border-rule',
        )}
      >
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} canDrag={canDrag} onOpen={() => onOpen(lead)} />
        ))}
        {leads.length === 0 && <li className="px-2 py-4 text-center text-sm text-ink-muted">No leads here</li>}
      </ul>
    </div>
  )
}

function LeadCard({ lead, canDrag, onOpen }: { lead: Lead; canDrag: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: lead.id, disabled: !canDrag })
  return (
    <li ref={setNodeRef} className={cn(isDragging && 'opacity-40')}>
      <CardBody
        lead={lead}
        onOpen={onOpen}
        handle={
          canDrag ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              aria-label={`Move ${lead.company}`}
              {...attributes}
              {...listeners}
              className="-m-1.5 inline-flex size-[44px] shrink-0 cursor-grab touch-none items-center justify-center rounded-card text-ink-muted hover:bg-ink/5 hover:text-ink"
            >
              <Icon icon={GripVertical} size={16} />
            </button>
          ) : null
        }
      />
    </li>
  )
}

function CardBody({ lead, onOpen, handle }: { lead: Lead; onOpen?: () => void; handle?: React.ReactNode }) {
  const overdue = isOverdue(lead)
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-rule bg-surface p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="inline-flex min-h-[44px] items-center text-left leading-snug font-medium underline-offset-2 hover:underline lg:min-h-0">
            {lead.company}
          </button>
          <p className="text-sm text-ink-muted">{lead.city ?? 'City not set'}</p>
        </div>
        {handle}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {lead.score !== null && <Pill>Score {lead.score}</Pill>}
        {lead.tier && <Pill tone={lead.tier === 'A' ? 'ok' : lead.tier === 'B' ? 'info' : 'neutral'}>Tier {lead.tier}</Pill>}
      </div>
      {lead.next_action && <p className="text-sm">{lead.next_action}</p>}
      {lead.follow_up_date && (
        <p className={cn('text-sm', overdue ? 'font-medium text-bad' : 'text-ink-muted')}>
          {overdue ? 'Overdue: ' : 'Follow up '}
          {formatShortDate(lead.follow_up_date)}
        </p>
      )}
    </div>
  )
}

const TEXT_FIELDS = [
  ['company', 'Company'],
  ['country', 'Country'],
  ['city', 'City'],
  ['industry', 'Industry'],
  ['website', 'Website'],
  ['instagram', 'Instagram'],
  ['linkedin', 'LinkedIn'],
  ['decision_maker', 'Decision Maker'],
  ['role', 'Role'],
  ['email', 'Email'],
  ['phone', 'Phone'],
] as const

function normalisePhone(value: string): string | null | undefined {
  const digits = value.replace(/[\s()-]/g, '')
  if (!digits) return null
  if (/^\+\d{8,15}$/.test(digits)) return digits
  if (/^0?[6-9]\d{9}$/.test(digits)) return `+91${digits.replace(/^0/, '')}`
  return undefined
}

function LeadDrawer({ lead, onClose }: { lead: Lead | undefined; onClose: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateLead()
  const update = useUpdateLead()
  const convert = useConvertLead()
  const can = useCan('lead', lead ? 'edit' : 'create')
  const canConvert = useCan('client', 'create') && can
  const activity = useLeadActivity(lead?.id)
  const { values, set, dirty } = useForm({
    company: lead?.company ?? '',
    country: lead?.country ?? 'India',
    city: lead?.city ?? '',
    industry: lead?.industry ?? '',
    website: lead?.website ?? '',
    instagram: lead?.instagram ?? '',
    linkedin: lead?.linkedin ?? '',
    decision_maker: lead?.decision_maker ?? '',
    role: lead?.role ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone_e164 ?? '',
    stage: (lead?.stage ?? 'new_lead') as LeadStage,
    score: lead?.score === null || lead === undefined ? '' : String(lead.score),
    tier: (lead?.tier ?? '') as LeadTier | '',
    problem: lead?.problem ?? '',
    opportunity: lead?.opportunity ?? '',
    recommended_offer: lead?.recommended_offer ?? '',
    budget: lead?.monthly_budget_minor == null ? '' : toRupeesInput(lead.monthly_budget_minor),
    next_action: lead?.next_action ?? '',
    follow_up_date: lead?.follow_up_date ?? '',
    notes: lead?.notes ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const next: Record<string, string> = {}
    const phone = normalisePhone(values.phone)
    const budget = values.budget.trim() ? toMinor(values.budget) : null
    const score = values.score.trim() ? Number(values.score) : null
    if (values.company.trim().length < 2) next.company = 'Enter the company name.'
    if (values.email.trim() && !/^\S+@\S+\.\S+$/.test(values.email.trim())) next.email = 'Enter a valid email address.'
    if (phone === undefined) next.phone = 'Enter a 10-digit mobile number or a number starting with +.'
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) next.score = 'Enter a whole number from 0 to 100.'
    if (budget !== null && (Number.isNaN(budget) || budget < 0)) next.budget = 'Enter an amount in rupees.'
    setErrors(next)
    if (Object.keys(next).length > 0 || !can) return

    const text = (value: string) => value.trim() || null
    const fields: LeadInsert = {
      company: values.company.trim(),
      country: text(values.country),
      city: text(values.city),
      industry: text(values.industry),
      website: text(values.website),
      instagram: text(values.instagram),
      linkedin: text(values.linkedin),
      decision_maker: text(values.decision_maker),
      role: text(values.role),
      email: text(values.email),
      phone_e164: phone ?? null,
      stage: values.stage,
      score,
      tier: values.tier || null,
      problem: text(values.problem),
      opportunity: text(values.opportunity),
      recommended_offer: text(values.recommended_offer),
      monthly_budget_minor: budget,
      next_action: text(values.next_action),
      follow_up_date: values.follow_up_date || null,
      notes: text(values.notes),
    }
    try {
      if (lead) await update.mutateAsync({ id: lead.id, patch: fields })
      else await create.mutateAsync(fields)
      toast({ title: lead ? `${fields.company} saved` : `${fields.company} added`, tone: 'ok' })
      onClose()
    } catch (error) {
      toast({ title: 'Could not save the lead', description: messageOf(error), tone: 'bad' })
    }
  }

  async function convertToClient() {
    if (!lead) return
    try {
      const client = await convert.mutateAsync(lead.id)
      toast({ title: `${client.name} is now a client`, tone: 'ok' })
      onClose()
      navigate(`/admin/clients/${client.id}`)
    } catch (error) {
      toast({ title: 'Could not convert the lead', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={lead ? lead.company : 'New lead'}
      description={lead ? STAGE_LABEL[lead.stage] : undefined}
      dirty={dirty}
      onSubmit={submit}
      submitLabel={lead ? 'Save changes' : 'Add lead'}
      pending={create.isPending || update.isPending}
      submitDisabled={!can}
    >
      {lead && lead.stage === 'closed_won' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-rule p-3">
          {lead.converted_client_id ? (
            <>
              <p>This lead is already a client.</p>
              <Link to={`/admin/clients/${lead.converted_client_id}`} className="inline-flex min-h-[44px] items-center lg:min-h-0 font-medium underline underline-offset-2">
                View client
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm">
                {dirty ? 'Save your changes before converting.' : 'Won. Create the client with these details.'}
              </p>
              {canConvert && (
                <Button variant="success" disabled={dirty} loading={convert.isPending} onClick={() => void convertToClient()}>
                  Convert to client
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map(([key, label]) => (
          <Field key={key} label={label} required={key === 'company'} error={errors[key]} className={key === 'company' ? 'sm:col-span-2' : undefined}>
            <Input
              type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
              value={values[key]}
              onChange={(event) => set(key, event.target.value)}
              autoFocus={key === 'company' && !lead}
            />
          </Field>
        ))}
        <Field label="Stage">
          <Select value={values.stage} onChange={(event) => set('stage', event.target.value as LeadStage)}>
            {LEAD_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABEL[stage]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Score" hint="0 to 100" error={errors.score}>
          <Input inputMode="numeric" value={values.score} onChange={(event) => set('score', event.target.value)} />
        </Field>
        <Field label="Tier">
          <Select value={values.tier} onChange={(event) => set('tier', event.target.value as LeadTier | '')}>
            <option value="">Not set</option>
            {LEAD_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                Tier {tier}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estimated Monthly Budget (₹)" error={errors.budget}>
          <Input inputMode="decimal" value={values.budget} onChange={(event) => set('budget', event.target.value)} />
        </Field>
        <Field label="Next Action">
          <Input value={values.next_action} onChange={(event) => set('next_action', event.target.value)} />
        </Field>
        <Field label="Follow-up Date">
          <Input type="date" value={values.follow_up_date} onChange={(event) => set('follow_up_date', event.target.value)} />
        </Field>
      </div>
      <Field label="Problem">
        <Textarea rows={2} value={values.problem} onChange={(event) => set('problem', event.target.value)} />
      </Field>
      <Field label="Opportunity">
        <Textarea rows={2} value={values.opportunity} onChange={(event) => set('opportunity', event.target.value)} />
      </Field>
      <Field label="Recommended Offer">
        <Input value={values.recommended_offer} onChange={(event) => set('recommended_offer', event.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea value={values.notes} onChange={(event) => set('notes', event.target.value)} />
      </Field>

      {lead && (
        <section aria-label="Activity log" className="flex flex-col gap-2">
          <h3 className="text-[1.0667rem]">Activity</h3>
          {activity.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : activity.isError ? (
            <QueryError what="the activity log" onRetry={() => activity.refetch()} />
          ) : activity.data.length === 0 ? (
            <p className="text-ink-muted">Nothing has happened to this lead yet.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-rule rounded-card border border-rule">
              {[...activity.data].reverse().map((entry) => (
                <li key={entry.id} className="px-3 py-2">
                  <p>{entry.text}</p>
                  <p className="text-sm text-ink-muted" title={formatDateTime(entry.created_at)}>
                    {relativeTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </FormDrawer>
  )
}

function ImportDrawer({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const importLeads = useImportLeads()
  const can = useCan('lead', 'create')
  const { values, set, dirty } = useForm({ text: '' })
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [error, setError] = useState<string>()

  const table = useMemo(() => parseCsv(values.text), [values.text])
  const headers = table[0] ?? []
  const body = table.slice(1)
  const result = useMemo(() => rowsToLeads(body, mapping), [body, mapping])

  function load(text: string) {
    set('text', text)
    setMapping(guessMapping(parseCsv(text)[0] ?? []))
    setError(undefined)
  }

  async function submit() {
    if (headers.length === 0 || body.length === 0) return setError('Choose a CSV file with a header row and at least one lead.')
    if (!Object.values(mapping).includes('company')) return setError('Map one column to Company.')
    if (result.leads.length === 0) return setError('No row has a company, so nothing can be imported.')
    setError(undefined)
    if (!can) return
    try {
      const added = await importLeads.mutateAsync(result.leads)
      toast({
        title: `${added.length} ${added.length === 1 ? 'lead' : 'leads'} imported`,
        description: result.skipped.length > 0 ? `${result.skipped.length} skipped for having no company.` : undefined,
        tone: 'ok',
      })
      onClose()
    } catch (failure) {
      toast({ title: 'Could not import', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title="Import leads from CSV"
      description="The first row must be the column names."
      dirty={dirty}
      onSubmit={submit}
      submitLabel={result.leads.length > 0 ? `Import ${result.leads.length} ${result.leads.length === 1 ? 'lead' : 'leads'}` : 'Import'}
      pending={importLeads.isPending}
      submitDisabled={!can}
    >
      <Field label="CSV file">
        <Input
          type="file"
          accept=".csv,text/csv"
          className="py-1.5"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void file.text().then(load)
          }}
        />
      </Field>
      <Field label="Or paste CSV text" error={error}>
        <Textarea rows={5} value={values.text} onChange={(event) => load(event.target.value)} className="font-mono text-sm" />
      </Field>

      {headers.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Match each column to a lead field</legend>
          {headers.map((header, index) => (
            <div key={index} className="grid grid-cols-2 items-center gap-3">
              <span className="min-w-0 truncate" title={header}>
                {header || `Column ${index + 1}`}
                <span className="block truncate text-sm text-ink-muted">{body[0]?.[index] ?? ''}</span>
              </span>
              <Select
                aria-label={`Field for ${header || `column ${index + 1}`}`}
                value={mapping[index] ?? ''}
                onChange={(event) => setMapping((current) => ({ ...current, [index]: event.target.value as LeadFieldKey | '' }))}
              >
                <option value="">Do not import</option>
                {LEAD_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <p className="text-sm text-ink-muted">
            {body.length} {body.length === 1 ? 'row' : 'rows'} found
            {result.skipped.length > 0 && `, ${result.skipped.length} without a company will be skipped`}.
            {result.leads[0]?.monthly_budget_minor != null && ` First budget reads as ${formatINR(result.leads[0].monthly_budget_minor)}.`}
          </p>
        </fieldset>
      )}
    </FormDrawer>
  )
}
