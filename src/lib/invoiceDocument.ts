import type { Client, DateString, Invoice, InvoiceItem } from '../types/db'
import type {
  InvoiceBillTo,
  InvoiceDefaults,
  InvoiceDocument,
  InvoiceLine,
  InvoiceTemplate,
} from '../types/invoiceDocument'

/** The Vernex logo and "Scan to pay" placeholder, as printed on the reference invoice. */
export const DEFAULT_LOGO_URL = '/invoice/vernex-invoice-logo.png'
export const DEFAULT_QR_URL = '/invoice/scan-to-pay-placeholder.png'

/** The reference invoice starts with this many empty rows. */
export const STARTING_ROWS = 12

/**
 * What a fresh install starts with: only what the Vernex reference invoice itself prints. The
 * business address, GSTIN and payment instructions are blank until an admin fills them in.
 */
export const BUILT_IN_DEFAULTS: InvoiceDefaults = {
  company: {
    name: 'Vernex Digital Marketing',
    tagline: 'Crafting your digital narrative.',
    phone: '+91 97899 12805',
    email: 'admin@vernex.in',
    website: 'www.vernex.in',
    address: '',
    gstin: '',
    logo: { kind: 'default' },
  },
  footer: {
    thank_you: 'Thank you for partnering with Vernex Digital Marketing.',
    closing: "Let's build something great together.",
  },
  payment: { qr: { kind: 'default' }, label: 'SCAN TO PAY', instructions: '' },
  currency: 'INR',
  // Offered in the picker only; no rate is applied until an admin chooses a GST type.
  gst_rates: [5, 18],
  tax: { mode: 'none', rate: 0 },
  payment_terms: '',
  show_page_numbers: false,
}

export const newLineId = () => crypto.randomUUID()

export const blankLine = (): InvoiceLine => ({ id: newLineId(), description: '', bill_period: '', quantity: null, rate_minor: null })

export const blankBillTo = (): InvoiceBillTo => ({ company_name: '', contact_person: '', address: '', email: '', phone: '', gstin: '' })

export function newInvoiceDocument(defaults: InvoiceDefaults): InvoiceDocument {
  return {
    version: 1,
    company: structuredClone(defaults.company),
    bill_to: blankBillTo(),
    project: { name: '', code: '', service_period_start: '', service_period_end: '', campaign_address: '' },
    billing_month: '',
    payment_terms: defaults.payment_terms,
    currency: defaults.currency,
    lines: Array.from({ length: STARTING_ROWS }, blankLine),
    tax: { ...defaults.tax },
    discount: { kind: 'amount', value: 0 },
    payment: structuredClone(defaults.payment),
    footer: { ...defaults.footer },
    show_page_numbers: defaults.show_page_numbers,
  }
}

/** Fills empty Bill To fields from the client record. Typed values are never overwritten. */
export function fillBillToFromClient(billTo: InvoiceBillTo, client: Pick<Client, 'name' | 'billing_email' | 'gstin'>): InvoiceBillTo {
  return {
    ...billTo,
    company_name: billTo.company_name || client.name,
    email: billTo.email || (client.billing_email ?? ''),
    gstin: billTo.gstin || (client.gstin ?? ''),
  }
}

// --- Months -------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-10` to "Oct 2026"; empty for anything else. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return ''
  return `${MONTHS[Number(match[2]) - 1] ?? ''} ${match[1]}`
}

/** `2026-12` plus one month is `2027-01`. */
export function addMonthsToMonth(month: string, count: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + count
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/**
 * A calendar date moved by whole months. The day is kept where it exists, clamped where it does
 * not (31 Jan to 28 Feb), and a month-end stays a month-end (30 Sep to 31 Oct).
 */
export function addMonthsToDate(day: DateString, count: number): DateString {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return day
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const target = addMonthsToMonth(`${match[1]}-${match[2]}`, count)
  const [targetYear, targetMonth] = target.split('-').map(Number) as [number, number]
  const wasMonthEnd = date === daysIn(year, month)
  const targetDay = wasMonthEnd ? daysIn(targetYear, targetMonth) : Math.min(date, daysIn(targetYear, targetMonth))
  return `${target}-${String(targetDay).padStart(2, '0')}`
}

const dayNumber = (day: DateString) => Date.parse(`${day}T00:00:00Z`) / 86_400_000
const fromDayNumber = (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10)

export type InvoiceCopy = { document: InvoiceDocument; issue_date: DateString; due_date: DateString }

/**
 * The next month's invoice: billing month, service period and dates move forward one month, the
 * due date keeps its gap from the invoice date, and row bill periods naming the old month are
 * renamed. The copy is a new draft; the number is left for the server to assign.
 */
export function nextMonthCopy(source: InvoiceCopy): InvoiceCopy {
  const document = structuredClone(source.document)
  const oldLabel = monthLabel(document.billing_month)
  if (document.billing_month) document.billing_month = addMonthsToMonth(document.billing_month, 1)
  const newLabel = monthLabel(document.billing_month)
  if (document.project.service_period_start) {
    document.project.service_period_start = addMonthsToDate(document.project.service_period_start, 1)
  }
  if (document.project.service_period_end) {
    document.project.service_period_end = addMonthsToDate(document.project.service_period_end, 1)
  }
  document.lines = document.lines.map((line) => ({
    ...line,
    id: newLineId(),
    bill_period: oldLabel && line.bill_period.trim() === oldLabel ? newLabel : line.bill_period,
  }))
  const issue_date = addMonthsToDate(source.issue_date, 1)
  const gap = dayNumber(source.due_date) - dayNumber(source.issue_date)
  const due_date = Number.isFinite(gap) ? fromDayNumber(dayNumber(issue_date) + gap) : source.due_date
  return { document, issue_date, due_date }
}

/**
 * A plain copy for the same billing period: new row ids, dated today, the due date keeping its gap
 * from the invoice date. The copy is a new draft; the number is left for the server to assign.
 */
export function sameMonthCopy(source: InvoiceCopy, today: DateString): InvoiceCopy {
  const document = structuredClone(source.document)
  document.lines = document.lines.map((line) => ({ ...line, id: newLineId() }))
  const gap = dayNumber(source.due_date) - dayNumber(source.issue_date)
  const due_date = Number.isFinite(gap) ? fromDayNumber(dayNumber(today) + Math.max(0, gap)) : today
  return { document, issue_date: today, due_date }
}

export type DuplicateMode = 'copy' | 'next_month'

// --- Templates ----------------------------------------------------------------

/** What a template keeps. Client details are dropped unless asked for. */
export function templateDocument(document: InvoiceDocument, includeClient: boolean): InvoiceDocument {
  const copy = structuredClone(document)
  if (!includeClient) {
    copy.bill_to = blankBillTo()
    copy.project = { name: '', code: '', service_period_start: '', service_period_end: '', campaign_address: '' }
  }
  copy.billing_month = ''
  return copy
}

/** Starts a draft from a template. Client details already typed stay when the template has none. */
export function applyTemplate(current: InvoiceDocument, template: Pick<InvoiceTemplate, 'document'>): InvoiceDocument {
  const next = structuredClone(template.document)
  const hasClient = Object.values(next.bill_to).some((value) => value.trim() !== '')
  if (!hasClient) {
    next.bill_to = structuredClone(current.bill_to)
    next.project = structuredClone(current.project)
  }
  next.billing_month = current.billing_month
  next.lines = next.lines.map((line) => ({ ...line, id: newLineId() }))
  return next
}

// --- Older invoices -------------------------------------------------------------

/**
 * A read-only page for an invoice made with the quick form, so every invoice can be viewed and
 * printed the same way. Company details are the built-in ones; nothing is invented for the client.
 */
export function documentFromLegacy(
  invoice: Pick<Invoice, 'currency' | 'tax_mode' | 'gst_rate' | 'discount_minor'>,
  items: Pick<InvoiceItem, 'description' | 'quantity' | 'unit_price_minor' | 'bill_period'>[],
  client: Pick<Client, 'name' | 'billing_email' | 'gstin'> | undefined,
): InvoiceDocument {
  const document = newInvoiceDocument(BUILT_IN_DEFAULTS)
  if (client) document.bill_to = fillBillToFromClient(document.bill_to, client)
  document.currency = invoice.currency
  document.tax = { mode: invoice.tax_mode, rate: invoice.gst_rate }
  document.discount = { kind: 'amount', value: invoice.discount_minor }
  document.payment = { qr: { kind: 'none' }, label: '', instructions: '' }
  document.lines = items.map((item) => ({
    id: newLineId(),
    description: item.description,
    bill_period: item.bill_period ?? '',
    quantity: item.quantity,
    rate_minor: item.unit_price_minor,
  }))
  return document
}

// --- Settings and images ----------------------------------------------------------

/**
 * Stored defaults over the built-in ones, so a settings row saved before a field existed still
 * yields a complete set.
 */
export function withBuiltInDefaults(stored: Partial<InvoiceDefaults> | null | undefined): InvoiceDefaults {
  const base = structuredClone(BUILT_IN_DEFAULTS)
  if (!stored) return base
  return {
    ...base,
    ...stored,
    company: { ...base.company, ...stored.company },
    footer: { ...base.footer, ...stored.footer },
    payment: { ...base.payment, ...stored.payment },
    tax: { ...base.tax, ...stored.tax },
    gst_rates: Array.isArray(stored.gst_rates) ? stored.gst_rates : base.gst_rates,
  }
}

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
export const MAX_INVOICE_IMAGE_BYTES = 2 * 1024 * 1024

/** Why an image cannot be used on an invoice, or null when it can. */
export function invoiceImageProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!IMAGE_EXTENSIONS[file.type]) return 'Use a PNG, JPEG or WebP image.'
  if (file.size > MAX_INVOICE_IMAGE_BYTES) return 'Use an image under 2 MB.'
  return null
}

/** `branding/<kind>-<uuid>.<ext>`: the only shape the invoice-assets bucket accepts. */
export function invoiceImagePath(kind: 'logo' | 'qr', type: string): string {
  return `branding/${kind}-${crypto.randomUUID()}.${IMAGE_EXTENSIONS[type] ?? 'png'}`
}

/** Stored image paths a document points at, for fetching viewable links. */
export function documentImagePaths(document: Pick<InvoiceDocument, 'company' | 'payment'>): string[] {
  return [document.company.logo, document.payment.qr].flatMap((image) => (image.kind === 'uploaded' ? [image.path] : []))
}
