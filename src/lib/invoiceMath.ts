import type { InvoiceCurrency, InvoiceDocument, InvoiceLine } from '../types/invoiceDocument'
import type { DateString, Minor } from '../types/db'

// Invoice arithmetic for the generator. supabase/migrations/20261023120000_invoice_generator.sql
// does exactly the same sums in invoice_compute(), so the live preview and the stored totals agree.
//
// Rules, in minor units (paise for INR):
//   line amount = round(quantity x rate)
//   subtotal    = sum of line amounts
//   discount    = the amount typed, or round(subtotal x percent / 100)
//   taxable     = subtotal - discount
//   CGST = SGST = round(taxable x rate / 200)    (same state)
//   IGST        = round(taxable x rate / 100)    (another state)
//   total       = taxable + CGST + SGST + IGST
// Every value is non-negative, so "round" is half-up. BigInt keeps it exact at any size.

/** Largest quantity on one line. */
export const MAX_QUANTITY = 10_000
/** Largest rate on one line, in minor units (1 crore rupees). */
export const MAX_RATE_MINOR = 1_000_000_000
export const MAX_LINES = 200
/**
 * One row's description. With both limits a single row always fits on an A4 page, so a row never
 * has to be split across pages or squeezed.
 */
export const MAX_DESCRIPTION_CHARS = 1500
export const MAX_DESCRIPTION_LINES = 30
export const MAX_BILL_PERIOD_CHARS = 120

export type InvoiceComputation = {
  /** One per line: its amount, or null when the line is not billed (blank or incomplete). */
  line_amounts: (Minor | null)[]
  subtotal_minor: Minor
  discount_minor: Minor
  taxable_minor: Minor
  cgst_minor: Minor
  sgst_minor: Minor
  igst_minor: Minor
  tax_minor: Minor
  total_minor: Minor
}

/** a / b rounded half-up, for a >= 0 and b > 0. */
function divRound(a: bigint, b: bigint): bigint {
  return (2n * a + b) / (2n * b)
}

/** A percent or quantity with up to two decimals, as hundredths. */
const hundredths = (value: number) => BigInt(Math.round(value * 100))

const usable = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0

/** Nothing typed in any cell. Blank rows are kept for layout and never billed. */
export function isBlankLine(line: InvoiceLine): boolean {
  return !line.description.trim() && !line.bill_period.trim() && line.quantity === null && line.rate_minor === null
}

/** A line that adds to the subtotal: it has a usable quantity and rate. */
export function isBilledLine(line: InvoiceLine): boolean {
  return usable(line.quantity) && usable(line.rate_minor)
}

export function lineAmount(line: InvoiceLine): Minor | null {
  if (!isBilledLine(line)) return null
  return Number(divRound(hundredths(line.quantity as number) * BigInt(Math.round(line.rate_minor as number)), 100n))
}

export function computeInvoice(document: Pick<InvoiceDocument, 'lines' | 'tax' | 'discount'>): InvoiceComputation {
  const line_amounts = document.lines.map(lineAmount)
  const subtotal = line_amounts.reduce<bigint>((sum, amount) => sum + BigInt(amount ?? 0), 0n)

  let discount = 0n
  const { kind, value } = document.discount
  if (Number.isFinite(value) && value > 0) {
    discount = kind === 'percent' ? divRound(subtotal * hundredths(Math.min(value, 100)), 10_000n) : BigInt(Math.round(value))
  }
  // An over-large discount is reported by validateInvoice; the sums never go below zero.
  if (discount > subtotal) discount = subtotal
  const taxable = subtotal - discount

  let cgst = 0n
  let sgst = 0n
  let igst = 0n
  const rate = document.tax.rate
  if (document.tax.mode !== 'none' && Number.isFinite(rate) && rate > 0) {
    if (document.tax.mode === 'cgst_sgst') {
      cgst = divRound(taxable * hundredths(rate), 20_000n)
      sgst = cgst
    } else {
      igst = divRound(taxable * hundredths(rate), 10_000n)
    }
  }
  const tax = cgst + sgst + igst

  return {
    line_amounts,
    subtotal_minor: Number(subtotal),
    discount_minor: Number(discount),
    taxable_minor: Number(taxable),
    cgst_minor: Number(cgst),
    sgst_minor: Number(sgst),
    igst_minor: Number(igst),
    tax_minor: Number(tax),
    total_minor: Number(taxable + tax),
  }
}

export type InvoiceIssue = {
  /** Where the problem is: `line:<id>:quantity`, `discount`, `tax`, `due_date`, `bill_to`, `lines`. */
  field: string
  message: string
}

export type ValidationContext = {
  issue_date: DateString
  due_date: DateString
  /** The GST rates the admin has configured. */
  gst_rates: number[]
  /** `draft` allows unfinished rows and empty details; `issue` needs a complete invoice. */
  stage: 'draft' | 'issue'
}

const twoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6

function checkNumber(issues: InvoiceIssue[], field: string, label: string, value: number | null, max: number) {
  if (value === null) return
  if (!Number.isFinite(value)) issues.push({ field, message: `${label} must be a number.` })
  else if (value < 0) issues.push({ field, message: `${label} cannot be negative.` })
  else if (value > max) issues.push({ field, message: `${label} is too large.` })
}

/**
 * Everything wrong with the invoice, in page order. Empty when it can be saved (`draft`) or issued
 * (`issue`). The database repeats these checks; this list is what the admin sees while typing.
 */
export function validateInvoice(document: InvoiceDocument, context: ValidationContext): InvoiceIssue[] {
  const issues: InvoiceIssue[] = []
  const strict = context.stage === 'issue'

  if (strict && !document.bill_to.company_name.trim()) {
    issues.push({ field: 'bill_to', message: 'Add the client or company name under Bill To.' })
  }
  if (context.issue_date && context.due_date && context.due_date < context.issue_date) {
    issues.push({ field: 'due_date', message: 'The due date cannot be before the invoice date.' })
  }
  if (strict && (!context.issue_date || !context.due_date)) {
    issues.push({ field: 'due_date', message: 'Set both the invoice date and the due date.' })
  }

  if (document.lines.length > MAX_LINES) {
    issues.push({ field: 'lines', message: `An invoice can have at most ${MAX_LINES} rows.` })
  }
  const seen = new Set<string>()
  document.lines.forEach((line, index) => {
    const row = `Row ${index + 1}`
    const key = `line:${line.id}`
    // Each row has its own id; a repeated id means a row was copied twice by mistake.
    if (seen.has(line.id)) issues.push({ field: `${key}:description`, message: `${row} is a duplicate of another row. Delete it and save again.` })
    seen.add(line.id)
    if (line.description.length > MAX_DESCRIPTION_CHARS || line.description.split('\n').length > MAX_DESCRIPTION_LINES) {
      issues.push({
        field: `${key}:description`,
        message: `${row} description is too long: keep it under ${MAX_DESCRIPTION_CHARS.toLocaleString('en-IN')} characters and ${MAX_DESCRIPTION_LINES} lines.`,
      })
    }
    if (line.bill_period.length > MAX_BILL_PERIOD_CHARS) {
      issues.push({ field: `${key}:bill_period`, message: `${row} billing period is too long.` })
    }
    checkNumber(issues, `${key}:quantity`, `${row} quantity`, line.quantity, MAX_QUANTITY)
    if (line.rate_minor !== null && Number.isFinite(line.rate_minor) && !Number.isInteger(line.rate_minor)) {
      issues.push({ field: `${key}:rate`, message: `${row} rate can have at most two decimal places.` })
    } else {
      checkNumber(issues, `${key}:rate`, `${row} rate`, line.rate_minor, MAX_RATE_MINOR)
    }
    if (line.quantity !== null && Number.isFinite(line.quantity) && !twoDecimals(line.quantity)) {
      issues.push({ field: `${key}:quantity`, message: `${row} quantity can have at most two decimal places.` })
    }
    if (strict && !isBlankLine(line)) {
      if (!line.description.trim()) issues.push({ field: `${key}:description`, message: `${row} needs a description.` })
      if (line.quantity === null || line.quantity === 0) {
        issues.push({ field: `${key}:quantity`, message: `${row} needs a quantity above zero.` })
      }
      if (line.rate_minor === null) issues.push({ field: `${key}:rate`, message: `${row} needs a rate.` })
    }
  })
  if (strict && !document.lines.some(isBilledLine)) {
    issues.push({ field: 'lines', message: 'Fill in at least one service row with a quantity and rate.' })
  }

  const totals = computeInvoice(document)
  const { kind, value } = document.discount
  if (!Number.isFinite(value)) issues.push({ field: 'discount', message: 'The discount must be a number.' })
  else if (value < 0) issues.push({ field: 'discount', message: 'The discount cannot be negative.' })
  else if (kind === 'percent' && value > 100) issues.push({ field: 'discount', message: 'A percentage discount cannot exceed 100%.' })
  else if (kind === 'percent' && !twoDecimals(value)) {
    issues.push({ field: 'discount', message: 'The discount percentage can have at most two decimal places.' })
  } else if (kind === 'amount' && !Number.isInteger(value)) {
    issues.push({ field: 'discount', message: 'The discount can have at most two decimal places.' })
  } else if (kind === 'amount' && value > totals.subtotal_minor) {
    issues.push({ field: 'discount', message: 'The discount cannot be more than the subtotal.' })
  }

  const { mode, rate } = document.tax
  if (mode === 'none') {
    if (rate !== 0) issues.push({ field: 'tax', message: 'Choose a GST type, or set the rate to 0 for no GST.' })
  } else {
    if (document.currency !== 'INR') {
      issues.push({ field: 'tax', message: 'GST applies only to INR invoices. Choose "No GST" for other currencies.' })
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      issues.push({ field: 'tax', message: 'Choose a GST rate.' })
    } else if (!context.gst_rates.includes(rate)) {
      issues.push({ field: 'tax', message: `${rate}% is not one of the configured GST rates.` })
    }
  }

  return issues
}

const SYMBOLS: Record<InvoiceCurrency, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
}

export const currencySymbol = (currency: InvoiceCurrency) => SYMBOLS[currency]

const plainFormats = new Map<InvoiceCurrency, Intl.NumberFormat>()

/** Minor units as a plain amount with two decimals: 1500050 INR is "15,000.50", grouped Indian style. */
export function formatAmount(minor: Minor, currency: InvoiceCurrency): string {
  let format = plainFormats.get(currency)
  if (!format) {
    format = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    plainFormats.set(currency, format)
  }
  return format.format(minor / 100)
}

/** Minor units with the currency sign: "₹15,000.50", "AED 1,200.00". */
export function formatMoney(minor: Minor, currency: InvoiceCurrency): string {
  const symbol = SYMBOLS[currency]
  return `${symbol}${symbol.length > 1 ? ' ' : ''}${formatAmount(minor, currency)}`
}

/** A percent for display: 18 is "18", 2.5 is "2.5". */
export const formatRate = (rate: number) => String(Number(rate.toFixed(2)))
