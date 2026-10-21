import type { Invoice, Minor } from '../types/db'

/** Statuses that still owe money. */
export const UNPAID: Invoice['status'][] = ['sent', 'viewed', 'partially_paid', 'overdue']

export const isUnpaid = (invoice: Pick<Invoice, 'status'>) => UNPAID.includes(invoice.status)

/** What is still to be paid on an invoice. */
export const owed = (invoice: Pick<Invoice, 'total_minor' | 'amount_paid_minor'>): Minor =>
  invoice.total_minor - invoice.amount_paid_minor

/** Rupees still owed. Invoices in other currencies are left out rather than added as if they were rupees. */
export const outstandingMinor = (invoices: Invoice[]): Minor =>
  invoices.filter((invoice) => isUnpaid(invoice) && invoice.currency === 'INR').reduce((sum, invoice) => sum + owed(invoice), 0)

/** Made with the Invoice Generator, so it opens there rather than in the quick form. */
// `!= null`: before the generator migration these columns are absent (undefined), not null.
export const isGeneratorInvoice = (invoice: Pick<Invoice, 'document'>) => invoice.document != null

/** Issued from the generator: its content is locked; changes need a revision. */
export const isLockedInvoice = (invoice: Pick<Invoice, 'issued_at'>) => invoice.issued_at != null
