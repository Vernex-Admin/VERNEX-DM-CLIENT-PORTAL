import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, ImageOff, RotateCcw, Upload } from 'lucide-react'
import { Icon } from '../../../components/Icon'
import { NumberInput } from '../../../components/invoice/inputs'
import { Button, Combobox, Field, Input, Pill, Select, Switch, Textarea, useToast } from '../../../components/ui'
import { formatDateTime } from '../../../lib/dates'
import { applyTemplate } from '../../../lib/invoiceDocument'
import { computeInvoice, formatMoney, formatRate } from '../../../lib/invoiceMath'
import type { InvoiceIssue } from '../../../lib/invoiceMath'
import { INVOICE_LIFECYCLE, TAX_MODE_LABEL } from '../../../lib/labels'
import { useCan } from '../../../lib/permissions'
import {
  useInvoiceEvents,
  useInvoiceTemplates,
  useRemoveInvoiceTemplate,
  useSaveInvoiceSettings,
  useUploadInvoiceImage,
} from '../../../lib/queries'
import type { Client, Invoice, InvoiceStatus, Project } from '../../../types/db'
import { INVOICE_CURRENCIES, TAX_MODES } from '../../../types/invoiceDocument'
import type {
  ImageRef,
  InvoiceCurrency,
  InvoiceDefaults,
  InvoiceDocument,
  InvoiceEvent,
  InvoiceSettings,
  PaymentMode,
  TaxMode,
} from '../../../types/invoiceDocument'

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

type SetDocument = (update: (document: InvoiceDocument) => InvoiceDocument) => void

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-rule pb-4 last:border-b-0">
      <h3 className="font-sans text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}

/**
 * The tax picker: GST type, then a rate from the configured list. With no rate already chosen and
 * no default rate set, the rate stays 0 so the admin has to pick one; none is assumed.
 */
export function taxChange(document: InvoiceDocument, mode: TaxMode, rates: number[], preferred: number): InvoiceDocument {
  if (mode === 'none') return { ...document, tax: { mode, rate: 0 } }
  const rate = rates.includes(document.tax.rate) ? document.tax.rate : rates.includes(preferred) ? preferred : 0
  return { ...document, tax: { mode, rate } }
}

// --- Images ---------------------------------------------------------------------

function ImagePicker({
  kind,
  label,
  image,
  previewUrl,
  builtInLabel,
  disabled,
  onChange,
}: {
  kind: 'logo' | 'qr'
  label: string
  image: ImageRef
  previewUrl: string | null
  builtInLabel: string
  disabled: boolean
  onChange: (image: ImageRef) => void
}) {
  const toast = useToast()
  const upload = useUploadInvoiceImage()
  const canUpload = useCan('invoice_settings', 'edit')
  const input = useRef<HTMLInputElement>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    try {
      const path = await upload.mutateAsync({ kind, file })
      onChange({ kind: 'uploaded', path })
      toast({ title: `${label} uploaded`, tone: 'ok' })
    } catch (error) {
      toast({ title: `Could not upload the ${label.toLowerCase()}`, description: messageOf(error), tone: 'bad' })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="grid size-20 shrink-0 place-items-center rounded-card border border-rule bg-surface p-1">
        {previewUrl ? (
          <img src={previewUrl} alt={`${label} preview`} className="max-h-full max-w-full object-contain" />
        ) : (
          <Icon icon={ImageOff} size={20} className="text-ink-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-sm text-ink-muted">
          {image.kind === 'default' ? builtInLabel : image.kind === 'uploaded' ? 'Uploaded image' : 'Not shown on the invoice'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            aria-label={`Upload ${label.toLowerCase()}`}
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <Button size="sm" disabled={disabled || !canUpload} loading={upload.isPending} onClick={() => input.current?.click()}>
            <Icon icon={Upload} size={14} />
            {image.kind === 'uploaded' ? 'Replace' : 'Upload'}
          </Button>
          {image.kind !== 'default' && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({ kind: 'default' })}>
              <Icon icon={RotateCcw} size={14} />
              Use built-in
            </Button>
          )}
          {image.kind !== 'none' && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({ kind: 'none' })}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Invoice details --------------------------------------------------------------

export function DetailsPanel(props: {
  document: InvoiceDocument
  setDocument: SetDocument
  locked: boolean
  settings: InvoiceSettings
  clients: Client[]
  clientId: string
  onClientChange: (client: Client | undefined) => void
  projects: Project[]
  projectId: string | null
  onProjectChange: (project: Project | undefined) => void
  logoUrl: string | null
  issueProblems: InvoiceIssue[]
  draftProblems: InvoiceIssue[]
  clientLocked: boolean
}) {
  const { document, setDocument, locked, settings } = props
  const rates = settings.defaults.gst_rates
  const totals = computeInvoice(document)
  const discountIsPercent = document.discount.kind === 'percent'
  const problems = props.draftProblems.length > 0 ? props.draftProblems : props.issueProblems

  return (
    <div className="flex flex-col gap-4">
      <Section title="Client">
        <Field label="Client" required hint={props.clientLocked ? 'Saved invoices stay with their client.' : 'Type to search. Empty Bill To fields are filled from the client record.'}>
          <Combobox
            value={props.clientId}
            disabled={locked || props.clientLocked}
            placeholder="Search clients…"
            emptyText="No client matches"
            options={props.clients.map((client) => ({ value: client.id, label: client.name, hint: client.city ?? undefined }))}
            onChange={(id) => props.onClientChange(props.clients.find((client) => client.id === id))}
          />
        </Field>
        <Field label="Linked project" hint="Optional. Fills the project name when it is empty.">
          <Select
            value={props.projectId ?? ''}
            disabled={locked || !props.clientId}
            onChange={(event) => props.onProjectChange(props.projects.find((project) => project.id === event.target.value))}
          >
            <option value="">Not linked</option>
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Currency and tax">
        <Field label="Currency">
          <Select
            value={document.currency}
            disabled={locked}
            onChange={(event) => setDocument((d) => ({ ...d, currency: event.target.value as InvoiceCurrency }))}
          >
            {INVOICE_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GST type">
            <Select
              value={document.tax.mode}
              disabled={locked}
              onChange={(event) =>
                setDocument((d) => taxChange(d, event.target.value as TaxMode, rates, settings.defaults.tax.rate))
              }
            >
              {TAX_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {TAX_MODE_LABEL[mode]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="GST rate">
            <Select
              value={String(document.tax.rate)}
              disabled={locked || document.tax.mode === 'none'}
              onChange={(event) => setDocument((d) => ({ ...d, tax: { ...d.tax, rate: Number(event.target.value) } }))}
            >
              {document.tax.mode === 'none' ? (
                <option value="0">Not applicable</option>
              ) : (
                <>
                  {document.tax.rate === 0 ? (
                    <option value="0" disabled>
                      Choose a rate…
                    </option>
                  ) : (
                    !rates.includes(document.tax.rate) && (
                      <option value={String(document.tax.rate)}>{formatRate(document.tax.rate)}% (not configured)</option>
                    )
                  )}
                  {rates.map((rate) => (
                    <option key={rate} value={String(rate)}>
                      {formatRate(rate)}%
                    </option>
                  ))}
                </>
              )}
            </Select>
          </Field>
        </div>
        {rates.length === 0 && <p className="text-sm text-ink-muted">No GST rates are configured. Add them under Defaults.</p>}
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <Field label="Discount">
            <Select
              value={document.discount.kind}
              disabled={locked}
              onChange={(event) =>
                setDocument((d) => ({ ...d, discount: { kind: event.target.value as 'amount' | 'percent', value: 0 } }))
              }
            >
              <option value="amount">Fixed amount</option>
              <option value="percent">Percentage</option>
            </Select>
          </Field>
          <Field label={discountIsPercent ? 'Discount (%)' : `Discount (${document.currency})`}>
            <NumberInput
              className="min-h-[44px] w-full rounded-field border border-rule bg-surface px-3 lg:min-h-[36px]"
              disabled={locked}
              minorUnits={!discountIsPercent}
              value={document.discount.value === 0 ? null : document.discount.value}
              onValue={(value) => setDocument((d) => ({ ...d, discount: { ...d.discount, value: value ?? 0 } }))}
            />
          </Field>
        </div>
        <dl className="flex flex-col gap-1 rounded-card border border-rule bg-surface p-3 text-sm">
          <SummaryLine label="Subtotal" value={formatMoney(totals.subtotal_minor, document.currency)} />
          <SummaryLine label="Discount" value={formatMoney(totals.discount_minor, document.currency)} />
          <SummaryLine label="Taxable amount" value={formatMoney(totals.taxable_minor, document.currency)} />
          <SummaryLine label="GST" value={document.tax.mode === 'none' ? 'Not applied' : formatMoney(totals.tax_minor, document.currency)} />
          <SummaryLine label="Total due" value={formatMoney(totals.total_minor, document.currency)} strong />
        </dl>
      </Section>

      <Section title="Branding">
        <ImagePicker
          kind="logo"
          label="Logo"
          image={document.company.logo}
          previewUrl={props.logoUrl}
          builtInLabel="Vernex logo"
          disabled={locked}
          onChange={(logo) => setDocument((d) => ({ ...d, company: { ...d.company, logo } }))}
        />
        <Switch
          label="Print page numbers"
          checked={document.show_page_numbers}
          disabled={locked}
          onChange={(event) => setDocument((d) => ({ ...d, show_page_numbers: event.target.checked }))}
        />
      </Section>

      {!locked && (
        <Section title="Before issuing">
          {problems.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ok">
              <Icon icon={CircleCheck} size={16} />
              Ready to issue.
            </p>
          ) : (
            <ul aria-label="Problems to fix" className="flex flex-col gap-1.5 text-sm text-bad">
              {problems.slice(0, 8).map((problem) => (
                <li key={`${problem.field}-${problem.message}`} className="flex items-start gap-1.5">
                  <Icon icon={CircleAlert} size={15} className="mt-0.5 shrink-0" />
                  {problem.message}
                </li>
              ))}
              {problems.length > 8 && <li className="text-ink-muted">…and {problems.length - 8} more.</li>}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'border-t border-rule pt-1 font-medium' : ''}`}>
      <dt className={strong ? '' : 'text-ink-muted'}>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  )
}

// --- Payment and QR -----------------------------------------------------------------

export function PaymentPanel(props: {
  document: InvoiceDocument
  setDocument: SetDocument
  locked: boolean
  settings: InvoiceSettings
  qrUrl: string | null
  invoice: Invoice | null
  onRecordStatus: () => void
}) {
  const { document, setDocument, locked, settings, invoice } = props
  const canRecord = useCan('invoice', 'edit', { clientId: invoice?.client_id })
  const mock = settings.payment_mode === 'mock'

  return (
    <div className="flex flex-col gap-4">
      <Section title="Payment mode">
        <div className="flex items-center gap-2">
          <Pill tone={mock ? 'warn' : 'ok'}>{mock ? 'Mock Payment' : 'Gateway Integration'}</Pill>
          {!settings.gateway_configured && <span className="text-sm text-ink-muted">No gateway configured</span>}
        </div>
        {mock && (
          <p className="text-sm text-ink-muted">
            The QR code is a placeholder. Showing or scanning it does not confirm any payment, and invoices are never marked paid
            automatically. Check your bank account, then record the status by hand.
          </p>
        )}
      </Section>

      {invoice && invoice.status !== 'draft' && (
        <Section title="Payment status">
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Status</dt>
              <dd>
                <Pill tone={INVOICE_LIFECYCLE[invoice.status].tone}>{INVOICE_LIFECYCLE[invoice.status].label}</Pill>
              </dd>
            </div>
            <SummaryLine label="Received" value={formatMoney(invoice.amount_paid_minor, invoice.currency)} />
            <SummaryLine label="Balance" value={formatMoney(invoice.total_minor - invoice.amount_paid_minor, invoice.currency)} strong />
          </dl>
          {canRecord && availableMoves(invoice.status).length > 0 && (
            <div>
              <Button onClick={props.onRecordStatus}>Record payment status</Button>
            </div>
          )}
        </Section>
      )}

      <Section title="Scan to pay">
        <ImagePicker
          kind="qr"
          label="QR code"
          image={document.payment.qr}
          previewUrl={props.qrUrl}
          builtInLabel="Supplied placeholder QR"
          disabled={locked}
          onChange={(qr) => setDocument((d) => ({ ...d, payment: { ...d.payment, qr } }))}
        />
        <Field label="Label under the QR code">
          <Input
            value={document.payment.label}
            disabled={locked}
            maxLength={60}
            onChange={(event) => setDocument((d) => ({ ...d, payment: { ...d.payment, label: event.target.value } }))}
          />
        </Field>
        <Field label="Payment instructions" hint="Printed beside the totals. Leave empty if none.">
          <Textarea
            rows={3}
            value={document.payment.instructions}
            disabled={locked}
            maxLength={500}
            onChange={(event) => setDocument((d) => ({ ...d, payment: { ...d.payment, instructions: event.target.value } }))}
          />
        </Field>
      </Section>
    </div>
  )
}

/** Payment statuses a person may move an issued invoice to (the database allows the same). */
export function availableMoves(status: InvoiceStatus): InvoiceStatus[] {
  switch (status) {
    case 'sent':
    case 'viewed':
      return ['partially_paid', 'paid', 'overdue', 'void']
    case 'partially_paid':
      return ['partially_paid', 'paid', 'overdue', 'void']
    case 'overdue':
      return ['partially_paid', 'paid', 'void']
    default:
      return []
  }
}

// --- Templates -----------------------------------------------------------------------

export function TemplatesPanel(props: {
  document: InvoiceDocument
  locked: boolean
  onApply: (document: InvoiceDocument, name: string) => void
  onSaveAsTemplate: () => void
}) {
  const toast = useToast()
  const templates = useInvoiceTemplates()
  const remove = useRemoveInvoiceTemplate()
  const canCreate = useCan('template', 'create')
  const canDelete = useCan('template', 'delete')

  async function removeTemplate(id: string, name: string) {
    try {
      await remove.mutateAsync(id)
      toast({ title: `Template "${name}" deleted`, tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not delete the template', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Save as template">
        <p className="text-sm text-ink-muted">Keep this layout, rows and tax settings to start future invoices from.</p>
        <div>
          <Button disabled={!canCreate} onClick={props.onSaveAsTemplate}>
            Save as template…
          </Button>
        </div>
      </Section>
      <Section title="Templates">
        {templates.isPending ? (
          <p className="text-sm text-ink-muted">Loading templates…</p>
        ) : templates.isError ? (
          <p className="text-sm text-bad">Could not load templates.</p>
        ) : templates.data.length === 0 ? (
          <p className="text-sm text-ink-muted">No templates yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.data.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-2 rounded-card border border-rule bg-surface p-2.5">
                <span className="min-w-0 truncate text-sm font-medium">{template.name}</span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    disabled={props.locked}
                    aria-label={`Apply template ${template.name}`}
                    onClick={() => props.onApply(applyTemplate(props.document, template), template.name)}
                  >
                    Apply
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete template ${template.name}`}
                      onClick={() => void removeTemplate(template.id, template.name)}
                    >
                      Delete
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

// --- Company defaults ----------------------------------------------------------------------

function parseRates(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean)
  const rates = parts.map(Number)
  if (rates.some((rate) => !Number.isFinite(rate))) return null
  return [...new Set(rates)].sort((a, b) => a - b)
}

export function DefaultsPanel({ settings, document }: { settings: InvoiceSettings; document: InvoiceDocument }) {
  const toast = useToast()
  const save = useSaveInvoiceSettings()
  const canEdit = useCan('invoice_settings', 'edit')
  const [defaults, setDefaults] = useState<InvoiceDefaults>(() => structuredClone(settings.defaults))
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(settings.payment_mode)
  const [ratesText, setRatesText] = useState(settings.defaults.gst_rates.join(', '))
  const [error, setError] = useState<string>()

  function stageFromInvoice() {
    setDefaults((current) => ({
      ...current,
      company: structuredClone(document.company),
      footer: { ...document.footer },
      payment: structuredClone(document.payment),
    }))
    toast({ title: "This invoice's company details, footer and payment block are staged", description: 'Save defaults to keep them.' })
  }

  async function submit() {
    const rates = parseRates(ratesText)
    if (!rates) {
      setError('Enter GST rates as numbers separated by commas, e.g. 5, 18.')
      return
    }
    setError(undefined)
    try {
      await save.mutateAsync({ defaults: { ...defaults, gst_rates: rates }, payment_mode: paymentMode })
      toast({ title: 'Invoice defaults saved', description: 'New invoices start from these. Existing invoices are unchanged.', tone: 'ok' })
    } catch (failure) {
      toast({ title: 'Could not save the defaults', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Company details">
        <dl className="flex flex-col gap-1 text-sm">
          <SummaryLine label="Name" value={defaults.company.name || 'Not set'} />
          <SummaryLine label="Address" value={defaults.company.address ? 'Set' : 'Not set'} />
          <SummaryLine label="GSTIN" value={defaults.company.gstin || 'Not set'} />
        </dl>
        <p className="text-sm text-ink-muted">Edit the company details, footer and QR block on the invoice, then copy them here.</p>
        <div>
          <Button disabled={!canEdit} onClick={stageFromInvoice}>
            Use this invoice's details
          </Button>
        </div>
      </Section>
      <Section title="Tax and currency">
        <Field label="GST rates offered (%)" hint="Separated by commas. No rate is applied until a GST type is chosen." error={error}>
          <Input value={ratesText} disabled={!canEdit} onChange={(event) => setRatesText(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default currency">
            <Select
              value={defaults.currency}
              disabled={!canEdit}
              onChange={(event) => setDefaults((d) => ({ ...d, currency: event.target.value as InvoiceCurrency }))}
            >
              {INVOICE_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default GST type">
            <Select
              value={defaults.tax.mode}
              disabled={!canEdit}
              onChange={(event) => {
                const mode = event.target.value as TaxMode
                const rates = parseRates(ratesText) ?? []
                setDefaults((d) => ({ ...d, tax: mode === 'none' ? { mode, rate: 0 } : { mode, rate: rates.includes(d.tax.rate) ? d.tax.rate : 0 } }))
              }}
            >
              {TAX_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {TAX_MODE_LABEL[mode]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {defaults.tax.mode !== 'none' && (
          <Field label="Default GST rate">
            <Select
              value={String(defaults.tax.rate)}
              disabled={!canEdit}
              onChange={(event) => setDefaults((d) => ({ ...d, tax: { ...d.tax, rate: Number(event.target.value) } }))}
            >
              {defaults.tax.rate === 0 && (
                <option value="0" disabled>
                  Choose a rate…
                </option>
              )}
              {(parseRates(ratesText) ?? []).map((rate) => (
                <option key={rate} value={String(rate)}>
                  {formatRate(rate)}%
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Default payment terms">
          <Input
            value={defaults.payment_terms}
            disabled={!canEdit}
            onChange={(event) => setDefaults((d) => ({ ...d, payment_terms: event.target.value }))}
          />
        </Field>
        <Switch
          label="Print page numbers by default"
          checked={defaults.show_page_numbers}
          disabled={!canEdit}
          onChange={(event) => setDefaults((d) => ({ ...d, show_page_numbers: event.target.checked }))}
        />
      </Section>
      <Section title="Payments">
        <Field
          label="Payment mode"
          hint={
            settings.gateway_configured
              ? 'Gateway payments are recorded only from a verified webhook.'
              : 'Gateway Integration stays off until a provider and verified webhook are set up on the server.'
          }
        >
          <Select value={paymentMode} disabled={!canEdit} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}>
            <option value="mock">Mock Payment</option>
            <option value="gateway" disabled={!settings.gateway_configured}>
              Gateway Integration{settings.gateway_configured ? '' : ' (not configured)'}
            </option>
          </Select>
        </Field>
      </Section>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!canEdit} loading={save.isPending} onClick={() => void submit()}>
          Save defaults
        </Button>
        {settings.updated_at && <span className="text-sm text-ink-muted">Last saved {formatDateTime(settings.updated_at)}</span>}
      </div>
    </div>
  )
}

// --- History --------------------------------------------------------------------------------

const EVENT_LABEL: Record<InvoiceEvent['event_type'], string> = {
  created: 'Draft created',
  edited: 'Draft saved',
  issued: 'Issued',
  revised: 'Revision started',
  superseded: 'Replaced by a revision',
  status_changed: 'Status changed',
  payment_recorded: 'Gateway payment recorded',
}

function describe(event: InvoiceEvent, currency: InvoiceCurrency): string | null {
  const details = event.details
  if (event.event_type === 'status_changed') {
    const from = INVOICE_LIFECYCLE[details.from as InvoiceStatus]?.label ?? String(details.from)
    const to = INVOICE_LIFECYCLE[details.to as InvoiceStatus]?.label ?? String(details.to)
    const amount = typeof details.amount_paid_minor === 'number' ? ` · received ${formatMoney(details.amount_paid_minor, currency)}` : ''
    return `${from} → ${to}${amount}`
  }
  if (event.event_type === 'created' && details.copied_from) return 'Copied from an earlier invoice'
  if (event.event_type === 'created' && details.revision_of) return 'Revision of an issued invoice'
  if ((event.event_type === 'revised' || event.event_type === 'superseded') && details.number) return `Revision ${String(details.number)}`
  return null
}

/** Server timestamps for the invoice, with who did each thing where the history knows. */
function Timestamps({ invoice, events }: { invoice: Invoice; events: InvoiceEvent[] }) {
  const last = (types: InvoiceEvent['event_type'][]) => [...events].reverse().find((event) => types.includes(event.event_type))
  const by = (event: InvoiceEvent | undefined) => (event?.actor_name ? ` · ${event.actor_name}` : '')
  const rows: [string, string | null, string][] = [
    ['Created', invoice.created_at, by(last(['created']))],
    ['Last changed', invoice.updated_at, by(last(['edited', 'created', 'issued', 'status_changed', 'superseded']))],
    ['Issued', invoice.issued_at, by(last(['issued']))],
    ['Paid', invoice.paid_at, by(last(['status_changed', 'payment_recorded']))],
  ]
  return (
    <dl aria-label="Timestamps" className="mb-4 flex flex-col gap-1 rounded-card border border-rule bg-surface p-3 text-sm">
      {rows.map(([label, at, who]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="text-right">{at ? `${formatDateTime(at)}${who}` : 'Not yet'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HistoryPanel({ invoice }: { invoice: Invoice }) {
  const events = useInvoiceEvents(invoice.id)
  const currency = invoice.currency
  if (events.isPending) return <p className="text-sm text-ink-muted">Loading history…</p>
  if (events.isError) return <p className="text-sm text-bad">Could not load the history.</p>
  return (
    <div>
      <Timestamps invoice={invoice} events={events.data} />
      {events.data.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
      ) : (
    <ol aria-label="Invoice history" className="flex flex-col gap-3">
      {[...events.data].reverse().map((event) => {
        const detail = describe(event, currency)
        const note = typeof event.details.note === 'string' ? event.details.note : null
        return (
          <li key={event.id} className="border-l-2 border-rule pl-3">
            <p className="text-sm font-medium">{EVENT_LABEL[event.event_type]}</p>
            {detail && <p className="text-sm">{detail}</p>}
            {note && <p className="text-sm text-ink-muted">“{note}”</p>}
            <p className="text-xs text-ink-muted">
              {formatDateTime(event.created_at)}
              {event.actor_user_id === null ? ' · system' : event.actor_name ? ` · ${event.actor_name}` : ''}
            </p>
          </li>
        )
      })}
    </ol>
      )}
    </div>
  )
}

