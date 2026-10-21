import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeft, Copy, CopyPlus, Download, Eye, FilePenLine, FileText, Lock, Pencil, Printer, Send } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Icon } from '../../../components/Icon'
import { NumberInput } from '../../../components/invoice/inputs'
import { invoiceFileName, useInvoiceImages } from '../../../components/invoice/invoiceImages'
import type { SheetMeta } from '../../../components/invoice/InvoiceSheet'
import { InvoiceWorkspace } from '../../../components/invoice/InvoiceWorkspace'
import type { InvoiceWorkspaceHandle } from '../../../components/invoice/InvoiceWorkspace'
import { QueryError } from '../../../components/QueryError'
import { Button, Checkbox, Dialog, Field, Input, Pill, Select, Skeleton, Tabs, Textarea, useToast } from '../../../components/ui'
import { formatDate, formatDateTime, istDay } from '../../../lib/dates'
import { documentFromLegacy, fillBillToFromClient, newInvoiceDocument, templateDocument } from '../../../lib/invoiceDocument'
import type { DuplicateMode } from '../../../lib/invoiceDocument'
import { formatMoney, validateInvoice } from '../../../lib/invoiceMath'
import { INVOICE_LIFECYCLE } from '../../../lib/labels'
import { useCan } from '../../../lib/permissions'
import {
  useClients,
  useDuplicateInvoice,
  useInvoice,
  useInvoiceSettings,
  useIssueInvoice,
  useProjects,
  useReviseInvoice,
  useSaveInvoiceDraft,
  useSaveInvoiceTemplate,
  useSetInvoicePaymentStatus,
} from '../../../lib/queries'
import type { Client, Invoice, InvoiceStatus, InvoiceWithItems } from '../../../types/db'
import type { InvoiceDocument, InvoiceSettings, ManualPaymentStatus } from '../../../types/invoiceDocument'
import {
  DefaultsPanel,
  DetailsPanel,
  HistoryPanel,
  PaymentPanel,
  TemplatesPanel,
  availableMoves,
  messageOf,
} from './InvoicePanels'

/** Everything the generator saves: the columns plus the page. */
type Draft = {
  id: string | null
  client_id: string
  project_id: string | null
  number: string
  issue_date: string
  due_date: string
  document: InvoiceDocument
}

const DAY_MS = 86_400_000
const snapshot = (draft: Draft) => JSON.stringify(draft)

function draftFromInvoice(invoice: InvoiceWithItems): Draft {
  return {
    id: invoice.id,
    client_id: invoice.client_id,
    project_id: invoice.project_id,
    number: invoice.number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    document: structuredClone(invoice.document as InvoiceDocument),
  }
}

/** Admin → Invoices → Create / open an invoice: /admin/invoices/new or /admin/invoices/:invoiceId. */
export default function InvoiceGeneratorPage() {
  const { invoiceId: routeId = 'new' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const invoiceId = routeId === 'new' ? undefined : routeId
  const settings = useInvoiceSettings()
  const existing = useInvoice(invoiceId)
  const clients = useClients()

  // One editor session per invoice opened. A new draft saved for the first time is "adopted": the
  // address gains its id but the editor (and anything typed meanwhile) stays. Until the address
  // shows the adopted id, the old address still belongs to this session.
  const [session, setSession] = useState<{ target: string; adopted?: string; confirmed?: boolean; count: number }>({
    target: routeId,
    count: 0,
  })
  const known = routeId === session.adopted || (routeId === session.target && !session.confirmed)
  if (!known) setSession({ target: routeId, count: session.count + 1 })
  else if (routeId === session.adopted && !session.confirmed) setSession({ ...session, confirmed: true })
  const adoptedHere = invoiceId !== undefined && invoiceId === session.adopted

  const clientId = params.get('client') ?? ''

  if (settings.isPending || clients.isPending || (invoiceId && existing.isPending && !adoptedHere)) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    )
  }
  if (settings.isError) return <QueryError what="the invoice settings" error={settings.error} onRetry={() => settings.refetch()} />
  if (clients.isError) return <QueryError what="the client list" error={clients.error} onRetry={() => clients.refetch()} />
  if (invoiceId && existing.isError && !adoptedHere) {
    return <QueryError what="this invoice" error={existing.error} onRetry={() => existing.refetch()} />
  }
  if (existing.data && existing.data.document == null) {
    return <QuickFormInvoice invoice={existing.data} client={clients.data.find((client) => client.id === existing.data.client_id)} />
  }

  return (
    <Editor
      key={session.count}
      settings={settings.data}
      clients={clients.data}
      initial={adoptedHere ? undefined : existing.data}
      clientId={existing.data?.client_id ?? clientId}
      projectTitle={params.get('title') ?? ''}
      onAdopt={(id) => {
        // Committed before the address changes, so the router's update never sees an unknown id.
        flushSync(() => setSession((current) => ({ ...current, adopted: id })))
        navigate(`/admin/invoices/${id}`, { replace: true })
      }}
      onOpen={(id) => navigate(`/admin/invoices/${id}`)}
    />
  )
}

function newDraft(settings: InvoiceSettings, clientId: string, projectTitle: string, clients: Client[]): Draft {
  const document = newInvoiceDocument(settings.defaults)
  const client = clients.find((row) => row.id === clientId)
  if (client) document.bill_to = fillBillToFromClient(document.bill_to, client)
  if (projectTitle) document.project.name = projectTitle
  return {
    id: null,
    client_id: client ? clientId : '',
    project_id: null,
    number: '',
    issue_date: istDay(new Date()),
    due_date: istDay(new Date(Date.now() + 15 * DAY_MS)),
    document,
  }
}

function Editor(props: {
  settings: InvoiceSettings
  clients: Client[]
  initial: InvoiceWithItems | undefined
  clientId: string
  projectTitle: string
  onAdopt: (id: string) => void
  onOpen: (id: string) => void
}) {
  const { settings, clients } = props
  const toast = useToast()
  const workspace = useRef<InvoiceWorkspaceHandle>(null)
  const [draft, setDraft] = useState<Draft>(() =>
    props.initial ? draftFromInvoice(props.initial) : newDraft(settings, props.clientId, props.projectTitle, clients),
  )
  const [savedAs, setSavedAs] = useState(() => (props.initial ? snapshot(draftFromInvoice(props.initial)) : ''))
  const [showIssueChecks, setShowIssueChecks] = useState(false)
  const [tab, setTab] = useState('details')
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [reviewing, setReviewing] = useState(false)
  const [dialog, setDialog] = useState<'status' | 'template' | 'revise' | null>(null)
  const [exporting, setExporting] = useState(false)

  const live = useInvoice(draft.id ?? undefined)
  const invoice: Invoice | null = live.data ?? props.initial ?? null
  const projects = useProjects({ client_id: draft.client_id || undefined })
  const images = useInvoiceImages(draft.document)
  const client = clients.find((row) => row.id === draft.client_id)

  const save = useSaveInvoiceDraft()
  const issue = useIssueInvoice()
  const revise = useReviseInvoice()
  const duplicate = useDuplicateInvoice()

  const canEdit = useCan('invoice', draft.id ? 'edit' : 'create', { clientId: draft.client_id || undefined })
  const canCreate = useCan('invoice', 'create', { clientId: draft.client_id || undefined })
  const locked = Boolean(invoice && invoice.status !== 'draft') || !canEdit
  const dirty = !locked && snapshot(draft) !== savedAs
  const busy = save.isPending || issue.isPending || revise.isPending || duplicate.isPending

  const context = { issue_date: draft.issue_date, due_date: draft.due_date, gst_rates: settings.defaults.gst_rates }
  const draftProblems = validateInvoice(draft.document, { ...context, stage: 'draft' })
  const issueProblems = validateInvoice(draft.document, { ...context, stage: 'issue' })
  const shown = showIssueChecks ? issueProblems : draftProblems
  const issuesByField = Object.fromEntries(shown.map((problem) => [problem.field, problem.message]))

  // Leaving with unsaved changes asks first.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const setDocument = (update: (document: InvoiceDocument) => InvoiceDocument) =>
    setDraft((current) => ({ ...current, document: update(current.document) }))
  const setMeta = (patch: Partial<SheetMeta>) => setDraft((current) => ({ ...current, ...patch }))

  async function saveDraft(): Promise<string | null> {
    if (!draft.client_id) {
      setTab('details')
      toast({ title: 'Choose the client this invoice is for', tone: 'bad' })
      return null
    }
    const [problem] = draftProblems
    if (problem) {
      toast({ title: 'Fix the highlighted fields first', description: problem.message, tone: 'bad' })
      return null
    }
    try {
      const saved = await save.mutateAsync({ ...draft, source_id: null })
      const next: Draft = { ...draft, id: saved.id, number: saved.number, document: saved.document ?? draft.document }
      setDraft(next)
      setSavedAs(snapshot(next))
      if (!draft.id) props.onAdopt(saved.id)
      toast({ title: `Draft ${saved.number} saved`, description: 'Not issued: the client cannot see drafts.', tone: 'ok' })
      return saved.id
    } catch (error) {
      toast({ title: 'Could not save the draft', description: messageOf(error), tone: 'bad' })
      return null
    }
  }

  /** Step 1 of issuing: check everything, then show the final pages for review. */
  function startReview() {
    setShowIssueChecks(true)
    const [problem] = issueProblems
    if (!draft.client_id) {
      setTab('details')
      toast({ title: 'Choose the client this invoice is for', tone: 'bad' })
    } else if (problem) {
      setTab('details')
      toast({ title: 'This invoice is not ready to issue', description: problem.message, tone: 'bad' })
    } else {
      setReviewing(true)
    }
  }

  /** Step 2: save if needed, issue on the server, and the client sees it in their portal. */
  async function confirmIssue() {
    const id = dirty || !draft.id ? await saveDraft() : draft.id
    if (!id) return
    try {
      const issued = await issue.mutateAsync(id)
      setReviewing(false)
      toast({
        title: `Invoice ${issued.number} issued and sent to ${client?.name ?? 'the client'}`,
        description: 'It is now locked, in their portal under Billing, and on their Action Required list.',
        tone: 'ok',
      })
    } catch (error) {
      toast({ title: 'Could not issue the invoice', description: messageOf(error), tone: 'bad' })
    }
  }

  async function confirmRevise() {
    if (!invoice) return
    try {
      const revision = await revise.mutateAsync(invoice.id)
      setDialog(null)
      toast({ title: `Revision ${revision.number} created`, description: `${invoice.number} stays valid until you issue the revision.`, tone: 'ok' })
      props.onOpen(revision.id)
    } catch (error) {
      toast({ title: 'Could not start a revision', description: messageOf(error), tone: 'bad' })
    }
  }

  async function duplicateAs(mode: DuplicateMode) {
    if (!invoice) return
    if (dirty) {
      toast({ title: 'Save your changes first', description: 'The copy is made from the saved invoice.', tone: 'bad' })
      return
    }
    try {
      const copy = await duplicate.mutateAsync({ id: invoice.id, mode })
      toast({
        title: mode === 'next_month' ? `Draft ${copy.number} created for the next month` : `Draft ${copy.number} created as a copy`,
        description: `${invoice.number} is unchanged.`,
        tone: 'ok',
      })
      props.onOpen(copy.id)
    } catch (error) {
      toast({ title: 'Could not copy the invoice', description: messageOf(error), tone: 'bad' })
    }
  }

  async function downloadPdf() {
    setExporting(true)
    try {
      await workspace.current?.downloadPdf()
      toast({ title: 'PDF downloaded', description: 'Same A4 pages as the preview.', tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not create the PDF', description: `${messageOf(error)} Use Print and choose “Save as PDF” instead.`, tone: 'bad' })
    } finally {
      setExporting(false)
    }
  }

  const status = invoice?.status ?? 'draft'
  const lifecycle = INVOICE_LIFECYCLE[status]
  const canRevise = Boolean(
    invoice?.issued_at && !invoice.superseded_by && ['sent', 'viewed', 'overdue'].includes(status) && invoice.amount_paid_minor === 0,
  )
  const showEditor = !locked && view === 'edit' && !reviewing
  const meta: SheetMeta = { number: draft.number, issue_date: draft.issue_date, due_date: draft.due_date }
  const stamp = status === 'paid' ? { label: 'Paid', tone: 'ok' as const } : status === 'void' ? { label: 'Cancelled', tone: 'bad' as const } : null
  const fileName = `${invoiceFileName(draft.number)}${status === 'draft' ? '-draft' : ''}`

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/admin/invoices"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-card border border-rule px-3 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            <Icon icon={ArrowLeft} size={15} />
            Invoices
          </Link>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-[1.35rem] leading-tight">
              {draft.id ? 'Invoice' : 'Create invoice'}
              <Pill tone={lifecycle.tone}>{lifecycle.label}</Pill>
              {dirty && <span className="font-sans text-sm font-normal text-ink-muted">Unsaved changes</span>}
            </h1>
            <p className="truncate text-sm text-ink-muted">
              <span className="font-mono">{draft.number || 'Number assigned on first save'}</span>
              {client ? ` · ${client.name}` : ''}
              {invoice && invoice.revision > 1 ? ` · revision ${invoice.revision}` : ''}
              {invoice ? ` · last saved ${formatDateTime(invoice.updated_at)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <>
              <Button onClick={() => void saveDraft()} loading={save.isPending} disabled={busy}>
                <Icon icon={FileText} size={15} />
                Save draft
              </Button>
              <Button variant="primary" onClick={startReview} disabled={busy || reviewing}>
                <Icon icon={Send} size={15} />
                Issue Invoice &amp; Send to Client
              </Button>
            </>
          )}
          {canRevise && canCreate && (
            <Button onClick={() => setDialog('revise')} disabled={busy}>
              <Icon icon={FilePenLine} size={15} />
              Revise
            </Button>
          )}
          {invoice && canCreate && (
            <>
              <Button onClick={() => void duplicateAs('copy')} disabled={busy}>
                <Icon icon={Copy} size={15} />
                Duplicate
              </Button>
              <Button onClick={() => void duplicateAs('next_month')} disabled={busy}>
                <Icon icon={CopyPlus} size={15} />
                Duplicate for next month
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => workspace.current?.print()}>
            <Icon icon={Printer} size={15} />
            Print
          </Button>
          <Button variant="ghost" loading={exporting} onClick={() => void downloadPdf()}>
            <Icon icon={Download} size={15} />
            Download PDF
          </Button>
        </div>
      </div>

      {reviewing && (
        <section aria-label="Final review" className="no-print flex flex-wrap items-center justify-between gap-3 rounded-card border border-gold bg-surface p-3">
          <p className="text-sm">
            <strong>Final review.</strong> These are the exact A4 pages {client?.name ?? 'the client'} will see and download. Issuing locks this version,
            records the issue time on the server and sends it to their portal. No payment is recorded.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setReviewing(false)} disabled={busy}>
              Back to editing
            </Button>
            <Button variant="primary" loading={save.isPending || issue.isPending} onClick={() => void confirmIssue()}>
              Confirm: issue &amp; send
            </Button>
          </div>
        </section>
      )}
      {invoice?.issued_at && (
        <div role="status" className="no-print flex items-start gap-2 rounded-card border border-rule bg-surface p-3 text-sm">
          <Icon icon={Lock} size={16} className="mt-0.5 shrink-0 text-ink-muted" />
          <span>
            Issued {formatDateTime(invoice.issued_at)} to {client?.name ?? 'the client'}. This version is locked: changes need a revision, which replaces it
            only once issued.
            {invoice.superseded_by && (
              <>
                {' '}
                <button type="button" className="underline" onClick={() => props.onOpen(invoice.superseded_by as string)}>
                  Open the revision that replaced it.
                </button>
              </>
            )}
          </span>
        </div>
      )}
      {invoice && !invoice.issued_at && invoice.revision_of && (
        <div role="status" className="no-print rounded-card border border-rule bg-surface p-3 text-sm">
          Revision {invoice.revision} of an issued invoice. The original stays valid until you issue this revision.{' '}
          <button type="button" className="underline" onClick={() => props.onOpen(invoice.revision_of as string)}>
            Open the original.
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <InvoiceWorkspace
          ref={workspace}
          fileName={fileName}
          document={draft.document}
          meta={meta}
          images={images}
          stamp={stamp}
          edit={showEditor ? { setDocument, setMeta, issues: issuesByField, numberPlaceholder: draft.id ? '' : 'Assigned on save' } : undefined}
          toolbarStart={
            !locked && !reviewing ? (
              <div role="group" aria-label="View" className="inline-flex rounded-card border border-rule bg-surface p-0.5">
                {(['edit', 'preview'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={view === mode}
                    onClick={() => setView(mode)}
                    className={`inline-flex min-h-[32px] items-center gap-1 rounded-field px-3 text-sm ${view === mode ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'}`}
                  >
                    <Icon icon={mode === 'edit' ? Pencil : Eye} size={14} />
                    {mode === 'edit' ? 'Edit' : 'Preview'}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm text-ink-muted">{reviewing ? 'Final preview' : 'Preview'}</span>
            )
          }
        />

        <aside className="no-print min-w-0 rounded-card border border-rule bg-paper p-3" aria-label="Invoice settings">
          <Tabs
            label="Invoice settings"
            value={tab}
            onValueChange={setTab}
            items={[
              {
                id: 'details',
                label: 'Invoice',
                content: (
                  <DetailsPanel
                    document={draft.document}
                    setDocument={setDocument}
                    locked={locked || reviewing}
                    settings={settings}
                    clients={clients}
                    clientId={draft.client_id}
                    clientLocked={Boolean(draft.id)}
                    onClientChange={(chosen) =>
                      setDraft((current) => ({
                        ...current,
                        client_id: chosen?.id ?? '',
                        project_id: null,
                        document: chosen
                          ? { ...current.document, bill_to: fillBillToFromClient(current.document.bill_to, chosen) }
                          : current.document,
                      }))
                    }
                    projects={projects.data ?? []}
                    projectId={draft.project_id}
                    onProjectChange={(project) =>
                      setDraft((current) => ({
                        ...current,
                        project_id: project?.id ?? null,
                        document:
                          project && !current.document.project.name
                            ? { ...current.document, project: { ...current.document.project, name: project.name } }
                            : current.document,
                      }))
                    }
                    logoUrl={images.logo}
                    issueProblems={issueProblems}
                    draftProblems={draftProblems}
                  />
                ),
              },
              {
                id: 'payment',
                label: 'Payment',
                content: (
                  <PaymentPanel
                    document={draft.document}
                    setDocument={setDocument}
                    locked={locked || reviewing}
                    settings={settings}
                    qrUrl={images.qr}
                    invoice={invoice}
                    onRecordStatus={() => setDialog('status')}
                  />
                ),
              },
              {
                id: 'templates',
                label: 'Templates',
                content: (
                  <TemplatesPanel
                    document={draft.document}
                    locked={locked || reviewing}
                    onSaveAsTemplate={() => setDialog('template')}
                    onApply={(document, name) => {
                      setDraft((current) => ({ ...current, document }))
                      toast({ title: `Template "${name}" applied`, description: 'Save the draft to keep it.', tone: 'ok' })
                    }}
                  />
                ),
              },
              { id: 'defaults', label: 'Defaults', content: <DefaultsPanel settings={settings} document={draft.document} /> },
              ...(invoice ? [{ id: 'history', label: 'History', content: <HistoryPanel invoice={invoice} /> }] : []),
            ]}
          />
        </aside>
      </div>

      <Dialog
        open={dialog === 'revise'}
        onClose={() => setDialog(null)}
        title={`Revise ${invoice?.number ?? 'invoice'}?`}
        description="A new draft revision is created from this invoice. The issued original stays valid and unchanged until you issue the revision, which then cancels it."
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={revise.isPending} onClick={() => void confirmRevise()}>
              Create revision
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Paid, part-paid and cancelled invoices cannot be revised.</p>
      </Dialog>
      {dialog === 'status' && invoice && <PaymentStatusDialog invoice={invoice} mock={settings.payment_mode === 'mock'} onClose={() => setDialog(null)} />}
      {dialog === 'template' && <SaveTemplateDialog document={draft.document} onClose={() => setDialog(null)} />}
    </div>
  )
}

const STATUS_CHOICE_LABEL: Partial<Record<InvoiceStatus, string>> = {
  partially_paid: 'Partially paid',
  paid: 'Paid in full',
  overdue: 'Overdue',
  void: 'Cancelled',
}

function PaymentStatusDialog({ invoice, mock, onClose }: { invoice: Invoice; mock: boolean; onClose: () => void }) {
  const toast = useToast()
  const setStatus = useSetInvoicePaymentStatus()
  const moves = availableMoves(invoice.status)
  const [status, setStatusChoice] = useState<InvoiceStatus>(moves[0] ?? 'paid')
  const [amount, setAmount] = useState<number | null>(invoice.status === 'partially_paid' ? invoice.amount_paid_minor : null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()

  async function submit() {
    if (status === 'partially_paid' && (amount === null || !Number.isInteger(amount) || amount <= 0 || amount >= invoice.total_minor)) {
      setError(`Enter the amount received: above zero and below ${formatMoney(invoice.total_minor, invoice.currency)}.`)
      return
    }
    setError(undefined)
    try {
      await setStatus.mutateAsync({
        id: invoice.id,
        input: { status: status as ManualPaymentStatus, amount_paid_minor: amount ?? undefined, note },
      })
      toast({ title: `${invoice.number} marked ${INVOICE_LIFECYCLE[status].label.toLowerCase()}`, description: 'Recorded in the history.', tone: 'ok' })
      onClose()
    } catch (failure) {
      toast({ title: 'Could not record the status', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record payment status for ${invoice.number}`}
      description={`Total ${formatMoney(invoice.total_minor, invoice.currency)} · received so far ${formatMoney(invoice.amount_paid_minor, invoice.currency)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={setStatus.isPending} onClick={() => void submit()}>
            Record status
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {mock && (
          <p role="note" className="rounded-card border border-rule bg-paper p-2.5 text-sm">
            Mock Payment mode: nothing has been verified automatically. Record a payment only after confirming the money arrived.
          </p>
        )}
        <Field label="New status">
          <Select value={status} onChange={(event) => setStatusChoice(event.target.value as InvoiceStatus)}>
            {moves.map((move) => (
              <option key={move} value={move}>
                {STATUS_CHOICE_LABEL[move] ?? INVOICE_LIFECYCLE[move].label}
              </option>
            ))}
          </Select>
        </Field>
        {status === 'partially_paid' && (
          <Field label={`Total received so far (${invoice.currency})`} error={error}>
            <NumberInput
              className="min-h-[44px] w-full rounded-field border border-rule bg-surface px-3 lg:min-h-[36px]"
              minorUnits
              value={amount}
              onValue={setAmount}
            />
          </Field>
        )}
        <Field label="Note" hint="Optional, e.g. the bank reference you checked. Kept in the history.">
          <Textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}

function SaveTemplateDialog({ document, onClose }: { document: InvoiceDocument; onClose: () => void }) {
  const toast = useToast()
  const saveTemplate = useSaveInvoiceTemplate()
  const [name, setName] = useState('')
  const [includeClient, setIncludeClient] = useState(false)
  const [error, setError] = useState<string>()

  async function submit() {
    if (!name.trim()) {
      setError('Give the template a name.')
      return
    }
    try {
      await saveTemplate.mutateAsync({ name: name.trim(), document: templateDocument(document, includeClient) })
      toast({ title: `Template "${name.trim()}" saved`, tone: 'ok' })
      onClose()
    } catch (failure) {
      toast({ title: 'Could not save the template', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Save as template"
      description="Keeps the company details, rows, tax, discount and payment block. Invoice number and dates are never saved."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saveTemplate.isPending} onClick={() => void submit()}>
            Save template
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="Template name" required error={error}>
          <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Checkbox
          label="Include client and project details"
          checked={includeClient}
          onChange={(event) => setIncludeClient(event.target.checked)}
        />
      </form>
    </Dialog>
  )
}

/** An invoice from the quick form: shown, printed and downloaded in the same layout; edited from the Invoices tab. */
function QuickFormInvoice({ invoice, client }: { invoice: InvoiceWithItems; client: Client | undefined }) {
  const toast = useToast()
  const workspace = useRef<InvoiceWorkspaceHandle>(null)
  const document = documentFromLegacy(invoice, invoice.items, client)
  const meta = { number: invoice.number, issue_date: invoice.issue_date, due_date: invoice.due_date }
  const images = useInvoiceImages(document)
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/invoices" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-card border border-rule px-3 text-sm text-ink-muted hover:bg-ink/5">
            <Icon icon={ArrowLeft} size={15} />
            Invoices
          </Link>
          <div>
            <h1 className="text-[1.35rem] leading-tight">Invoice {invoice.number}</h1>
            <p className="text-sm text-ink-muted">
              Made with the quick form on {formatDate(invoice.created_at)}. Edit it from the client's Invoices tab.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => workspace.current?.print()}>
            <Icon icon={Printer} size={15} />
            Print
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              void workspace.current?.downloadPdf().catch((error: unknown) => toast({ title: 'Could not create the PDF', description: messageOf(error), tone: 'bad' }))
            }
          >
            <Icon icon={Download} size={15} />
            Download PDF
          </Button>
        </div>
      </div>
      <InvoiceWorkspace ref={workspace} fileName={invoiceFileName(invoice.number)} document={document} meta={meta} images={images} />
    </div>
  )
}
