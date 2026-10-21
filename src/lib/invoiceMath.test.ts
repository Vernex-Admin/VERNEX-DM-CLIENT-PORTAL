import { describe, expect, it } from 'vitest'
import { parseNumberInput } from '../components/invoice/inputs'
import {
  BUILT_IN_DEFAULTS,
  STARTING_ROWS,
  addMonthsToDate,
  addMonthsToMonth,
  applyTemplate,
  invoiceImageProblem,
  monthLabel,
  newInvoiceDocument,
  nextMonthCopy,
  templateDocument,
  withBuiltInDefaults,
} from './invoiceDocument'
import { computeInvoice, formatMoney, isBlankLine, lineAmount, validateInvoice } from './invoiceMath'
import type { ValidationContext } from './invoiceMath'
import type { InvoiceDocument, InvoiceLine } from '../types/invoiceDocument'

const line = (quantity: number | null, rate_minor: number | null, description = 'Service'): InvoiceLine => ({
  id: crypto.randomUUID(),
  description,
  bill_period: '',
  quantity,
  rate_minor,
})

function doc(patch: Partial<InvoiceDocument> = {}): InvoiceDocument {
  return { ...newInvoiceDocument(BUILT_IN_DEFAULTS), ...patch }
}

const draftContext: ValidationContext = { issue_date: '2026-10-01', due_date: '2026-10-15', gst_rates: [5, 18], stage: 'draft' }
const issueContext: ValidationContext = { ...draftContext, stage: 'issue' }
const messages = (document: InvoiceDocument, context: ValidationContext = draftContext) => validateInvoice(document, context).map((issue) => issue.message)

describe('a blank invoice', () => {
  it('starts with 12 empty rows, no GST and no invented business details', () => {
    const document = newInvoiceDocument(BUILT_IN_DEFAULTS)
    expect(document.lines).toHaveLength(STARTING_ROWS)
    expect(document.lines.every(isBlankLine)).toBe(true)
    expect(document.tax).toEqual({ mode: 'none', rate: 0 })
    expect(document.company.address).toBe('')
    expect(document.company.gstin).toBe('')
    expect(document.payment.instructions).toBe('')
    expect(document.bill_to).toEqual({ company_name: '', contact_person: '', address: '', email: '', phone: '', gstin: '' })
    expect(computeInvoice(document)).toMatchObject({ subtotal_minor: 0, taxable_minor: 0, total_minor: 0 })
  })

  it('can be saved as a draft but not issued', () => {
    const document = newInvoiceDocument(BUILT_IN_DEFAULTS)
    expect(messages(document)).toEqual([])
    expect(messages(document, issueContext)).toEqual([
      'Add the client or company name under Bill To.',
      'Fill in at least one service row with a quantity and rate.',
    ])
  })
})

describe('line amounts and totals', () => {
  it('multiplies quantity by rate and rounds half up to the paisa', () => {
    expect(lineAmount(line(2, 1_500_000))).toBe(3_000_000)
    // 1.5 x 333.33 = 499.995 rupees: 49,999.5 paise rounds up.
    expect(lineAmount(line(1.5, 33_333))).toBe(50_000)
    expect(lineAmount(line(0.33, 100))).toBe(33)
    expect(lineAmount(line(null, 100))).toBeNull()
    expect(lineAmount(line(1, null))).toBeNull()
  })

  it('sums only billed rows; blank and half-filled rows add nothing', () => {
    const document = doc({ lines: [line(1, 1_000_000), line(null, null, ''), line(null, 50_000, 'Unpriced'), line(3, 250_000)] })
    const totals = computeInvoice(document)
    expect(totals.line_amounts).toEqual([1_000_000, null, null, 750_000])
    expect(totals.subtotal_minor).toBe(1_750_000)
  })

  it('takes a fixed or percentage discount before tax', () => {
    const lines = [line(1, 1_000_000)]
    expect(computeInvoice(doc({ lines, discount: { kind: 'amount', value: 100_000 } }))).toMatchObject({
      discount_minor: 100_000,
      taxable_minor: 900_000,
      total_minor: 900_000,
    })
    // 12.5% of 3,333.33 = 416.67 (41,666.625 paise rounds up).
    expect(computeInvoice(doc({ lines: [line(1, 333_333)], discount: { kind: 'percent', value: 12.5 } }))).toMatchObject({
      discount_minor: 41_667,
      taxable_minor: 291_666,
    })
  })

  it('splits GST into CGST and SGST in the same state, and charges IGST otherwise', () => {
    const lines = [line(1, 1_000_000)]
    expect(computeInvoice(doc({ lines, tax: { mode: 'cgst_sgst', rate: 18 } }))).toMatchObject({
      cgst_minor: 90_000,
      sgst_minor: 90_000,
      igst_minor: 0,
      total_minor: 1_180_000,
    })
    expect(computeInvoice(doc({ lines, tax: { mode: 'igst', rate: 18 } }))).toMatchObject({
      cgst_minor: 0,
      sgst_minor: 0,
      igst_minor: 180_000,
      total_minor: 1_180_000,
    })
    expect(computeInvoice(doc({ lines, tax: { mode: 'none', rate: 0 } })).tax_minor).toBe(0)
  })

  it('charges GST on the discounted amount', () => {
    const totals = computeInvoice(doc({ lines: [line(1, 1_000_000)], discount: { kind: 'percent', value: 10 }, tax: { mode: 'cgst_sgst', rate: 18 } }))
    expect(totals).toMatchObject({ taxable_minor: 900_000, cgst_minor: 81_000, sgst_minor: 81_000, total_minor: 1_062_000 })
  })

  it('stays exact at the largest allowed values', () => {
    const lines = Array.from({ length: 20 }, () => line(10_000, 1_000_000_000))
    const totals = computeInvoice(doc({ lines, tax: { mode: 'igst', rate: 18 } }))
    expect(totals.subtotal_minor).toBe(200_000_000_000_000)
    expect(totals.igst_minor).toBe(36_000_000_000_000)
    expect(totals.total_minor).toBe(236_000_000_000_000)
  })
})

describe('validation', () => {
  it('refuses negative, non-numeric and over-precise values', () => {
    const document = doc({ lines: [line(-1, 100), line(Number.NaN, 100), line(1, 100.5), line(1.234, 100)] })
    expect(messages(document)).toEqual([
      'Row 1 quantity cannot be negative.',
      'Row 2 quantity must be a number.',
      'Row 3 rate can have at most two decimal places.',
      'Row 4 quantity can have at most two decimal places.',
    ])
  })

  it('checks discounts against the subtotal and 100%', () => {
    const lines = [line(1, 10_000)]
    expect(messages(doc({ lines, discount: { kind: 'amount', value: 20_000 } }))).toEqual(['The discount cannot be more than the subtotal.'])
    expect(messages(doc({ lines, discount: { kind: 'percent', value: 120 } }))).toEqual(['A percentage discount cannot exceed 100%.'])
    expect(messages(doc({ lines, discount: { kind: 'amount', value: -5 } }))).toEqual(['The discount cannot be negative.'])
  })

  it('refuses invalid tax combinations', () => {
    const lines = [line(1, 10_000)]
    expect(messages(doc({ lines, tax: { mode: 'none', rate: 18 } }))).toEqual(['Choose a GST type, or set the rate to 0 for no GST.'])
    expect(messages(doc({ lines, tax: { mode: 'cgst_sgst', rate: 0 } }))).toEqual(['Choose a GST rate.'])
    expect(messages(doc({ lines, tax: { mode: 'igst', rate: 12 } }))).toEqual(['12% is not one of the configured GST rates.'])
    expect(messages(doc({ lines, currency: 'USD', tax: { mode: 'igst', rate: 18 } }))).toEqual([
      'GST applies only to INR invoices. Choose "No GST" for other currencies.',
    ])
    expect(messages(doc({ lines, currency: 'USD' }))).toEqual([])
  })

  it('needs complete rows and dates in order to issue', () => {
    const document = doc({ lines: [line(1, 10_000, ''), line(null, null, 'Reels, no price yet')] })
    document.bill_to.company_name = 'AGK Fitness'
    expect(messages(document, { ...issueContext, due_date: '2026-09-01' })).toEqual([
      'The due date cannot be before the invoice date.',
      'Row 1 needs a description.',
      'Row 2 needs a quantity above zero.',
      'Row 2 needs a rate.',
    ])
  })
})

describe('money display', () => {
  it('formats each currency with its sign and two decimals', () => {
    expect(formatMoney(150_000_050, 'INR')).toBe('₹15,00,000.50')
    expect(formatMoney(150_000_050, 'USD')).toBe('$1,500,000.50')
    expect(formatMoney(120_000, 'AED')).toBe('AED 1,200.00')
  })
})

describe('next month copy', () => {
  it('moves months, service period, dates and matching bill periods forward', () => {
    const document = doc({ billing_month: '2026-10', lines: [{ ...line(1, 100), bill_period: 'Oct 2026' }, { ...line(4, 100), bill_period: '4 reels' }] })
    document.project.service_period_start = '2026-10-01'
    document.project.service_period_end = '2026-10-31'
    const copy = nextMonthCopy({ document, issue_date: '2026-10-05', due_date: '2026-10-20' })
    expect(copy.document.billing_month).toBe('2026-11')
    expect(copy.document.project).toMatchObject({ service_period_start: '2026-11-01', service_period_end: '2026-11-30' })
    expect(copy.document.lines.map((row) => row.bill_period)).toEqual(['Nov 2026', '4 reels'])
    expect(copy.document.lines[0]?.id).not.toBe(document.lines[0]?.id)
    expect(copy).toMatchObject({ issue_date: '2026-11-05', due_date: '2026-11-20' })
    // The source is untouched.
    expect(document.billing_month).toBe('2026-10')
  })

  it('handles year ends, month ends and short months', () => {
    expect(addMonthsToMonth('2026-12', 1)).toBe('2027-01')
    expect(addMonthsToDate('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonthsToDate('2026-09-30', 1)).toBe('2026-10-31')
    expect(addMonthsToDate('2026-10-15', 1)).toBe('2026-11-15')
    expect(monthLabel('2027-01')).toBe('Jan 2027')
    expect(monthLabel('')).toBe('')
  })
})

describe('templates and defaults', () => {
  it('drops client details from a template unless asked, and keeps typed client details when applied', () => {
    const document = doc({ lines: [line(1, 500_000, 'Monthly social media package')], billing_month: '2026-10' })
    document.bill_to.company_name = 'AGK Fitness'
    document.project.name = 'Diwali campaign'
    const template = templateDocument(document, false)
    expect(template.bill_to.company_name).toBe('')
    expect(template.project.name).toBe('')
    expect(template.billing_month).toBe('')
    expect(templateDocument(document, true).bill_to.company_name).toBe('AGK Fitness')

    const current = doc()
    current.bill_to.company_name = 'Raack Dance Academy'
    const applied = applyTemplate(current, { document: template })
    expect(applied.bill_to.company_name).toBe('Raack Dance Academy')
    expect(applied.lines[0]?.description).toBe('Monthly social media package')
  })

  it('fills fields missing from stored defaults with the built-in ones', () => {
    const merged = withBuiltInDefaults({ company: { ...BUILT_IN_DEFAULTS.company, address: 'Chennai office' }, gst_rates: [18] })
    expect(merged.company.address).toBe('Chennai office')
    expect(merged.gst_rates).toEqual([18])
    expect(merged.footer).toEqual(BUILT_IN_DEFAULTS.footer)
  })

  it('accepts only small PNG, JPEG or WebP images', () => {
    expect(invoiceImageProblem({ type: 'image/png', size: 1000 })).toBeNull()
    expect(invoiceImageProblem({ type: 'image/gif', size: 1000 })).toBe('Use a PNG, JPEG or WebP image.')
    expect(invoiceImageProblem({ type: 'image/jpeg', size: 3 * 1024 * 1024 })).toBe('Use an image under 2 MB.')
  })
})

describe('number cells', () => {
  it('parses rupees to exact paise and flags mistakes for validation', () => {
    expect(parseNumberInput('', true)).toBeNull()
    expect(parseNumberInput('1500', true)).toBe(150_000)
    expect(parseNumberInput('1,500.5', true)).toBe(150_050)
    expect(parseNumberInput('0.1', true)).toBe(10)
    expect(parseNumberInput('-20', true)).toBe(-2_000)
    expect(Number.isInteger(parseNumberInput('1.005', true))).toBe(false)
    expect(parseNumberInput('abc', true)).toBeNaN()
    expect(parseNumberInput('2.5')).toBe(2.5)
  })
})
