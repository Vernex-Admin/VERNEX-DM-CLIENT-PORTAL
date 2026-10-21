import type { DateString, Minor, Timestamp, UUID } from './db'

// The editable invoice behind the Invoice Generator, stored as `invoices.document`.
// Everything printed on the A4 page lives here except the number, issue date and due date,
// which stay real columns so lists, reminders and RLS keep working on them.

export const INVOICE_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'] as const
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number]

/** `none`: no GST. `cgst_sgst`: same state, the rate is split in half. `igst`: another state. */
export const TAX_MODES = ['none', 'cgst_sgst', 'igst'] as const
export type TaxMode = (typeof TAX_MODES)[number]

export type DiscountKind = 'amount' | 'percent'

/** An image on the invoice: the bundled Vernex artwork, an upload in private storage, or nothing. */
export type ImageRef = { kind: 'default' } | { kind: 'uploaded'; path: string } | { kind: 'none' }

/**
 * One row of the service table. A row with nothing in it keeps its place on the page but is not
 * billed. `quantity` and `rate_minor` are null while their cell is empty.
 */
export type InvoiceLine = {
  id: string
  description: string
  bill_period: string
  quantity: number | null
  /** Minor units of the invoice currency (paise for INR). */
  rate_minor: number | null
}

export type InvoiceCompany = {
  name: string
  tagline: string
  phone: string
  email: string
  website: string
  address: string
  gstin: string
  logo: ImageRef
}

export type InvoiceBillTo = {
  company_name: string
  contact_person: string
  address: string
  email: string
  phone: string
  gstin: string
}

export type InvoiceProjectDetails = {
  name: string
  code: string
  /** `YYYY-MM-DD`, or empty. */
  service_period_start: DateString | ''
  service_period_end: DateString | ''
  campaign_address: string
}

export type InvoiceTax = {
  mode: TaxMode
  /** Percent. Always 0 when `mode` is `none`. */
  rate: number
}

export type InvoiceDiscount = {
  kind: DiscountKind
  /** Minor units when `kind` is `amount`; a percent when it is `percent`. */
  value: number
}

/** The "Scan to pay" block. A visual aid only: showing or scanning it never marks anything paid. */
export type InvoicePaymentBlock = {
  qr: ImageRef
  label: string
  instructions: string
}

export type InvoiceFooter = {
  thank_you: string
  closing: string
}

export type InvoiceDocument = {
  version: 1
  company: InvoiceCompany
  bill_to: InvoiceBillTo
  project: InvoiceProjectDetails
  /** `YYYY-MM`, or empty. */
  billing_month: string
  payment_terms: string
  currency: InvoiceCurrency
  lines: InvoiceLine[]
  tax: InvoiceTax
  discount: InvoiceDiscount
  payment: InvoicePaymentBlock
  footer: InvoiceFooter
  show_page_numbers: boolean
}

/** `mock`: QR is a placeholder and payments are recorded by hand. `gateway`: verified webhook payments. */
export type PaymentMode = 'mock' | 'gateway'

/** Company-wide defaults every new invoice starts from. */
export type InvoiceDefaults = {
  company: InvoiceCompany
  footer: InvoiceFooter
  payment: InvoicePaymentBlock
  currency: InvoiceCurrency
  /** The GST rates offered in the tax picker, in percent. */
  gst_rates: number[]
  tax: InvoiceTax
  payment_terms: string
  show_page_numbers: boolean
}

export type InvoiceSettings = {
  defaults: InvoiceDefaults
  payment_mode: PaymentMode
  /** Set on the server once a gateway and its webhook secret exist. The app cannot switch it on. */
  gateway_configured: boolean
  updated_at: Timestamp | null
}

export type InvoiceSettingsInput = { defaults: InvoiceDefaults; payment_mode: PaymentMode }

export type InvoiceTemplate = {
  id: UUID
  name: string
  document: InvoiceDocument
  created_by: UUID
  created_at: Timestamp
  updated_at: Timestamp
}

export type InvoiceEventType =
  | 'created'
  | 'edited'
  | 'issued'
  | 'revised'
  | 'superseded'
  | 'status_changed'
  | 'payment_recorded'

export type InvoiceEvent = {
  id: UUID
  invoice_id: UUID
  /** Null for events written by the server itself, such as a verified gateway webhook. */
  actor_user_id: UUID | null
  /** The person's name when the event was recorded, so the history reads without a lookup. */
  actor_name: string | null
  event_type: InvoiceEventType
  details: Record<string, unknown>
  created_at: Timestamp
}

/** What the generator saves. `id` null creates a draft; an empty `number` is assigned by the server. */
export type InvoiceDraftInput = {
  id: UUID | null
  client_id: UUID
  project_id: UUID | null
  number: string
  issue_date: DateString
  due_date: DateString
  document: InvoiceDocument
  /** The invoice this draft was copied from, for the audit history. */
  source_id?: UUID | null
}

/** Statuses a person may set by hand once an invoice is issued. */
export const MANUAL_PAYMENT_STATUSES = ['sent', 'partially_paid', 'paid', 'overdue', 'void'] as const
export type ManualPaymentStatus = (typeof MANUAL_PAYMENT_STATUSES)[number]

export type PaymentStatusInput = {
  status: ManualPaymentStatus
  /** Required for `partially_paid`; ignored otherwise. */
  amount_paid_minor?: Minor
  note?: string
}
