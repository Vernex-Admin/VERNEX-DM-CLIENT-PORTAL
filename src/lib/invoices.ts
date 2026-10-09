import type { Invoice, Minor } from '../types/db'

/** Statuses that still owe money. */
export const UNPAID: Invoice['status'][] = ['sent', 'viewed', 'partially_paid', 'overdue']

export const isUnpaid = (invoice: Pick<Invoice, 'status'>) => UNPAID.includes(invoice.status)

/** What is still to be paid on an invoice. */
export const owed = (invoice: Pick<Invoice, 'total_minor' | 'amount_paid_minor'>): Minor =>
  invoice.total_minor - invoice.amount_paid_minor

export const outstandingMinor = (invoices: Invoice[]): Minor =>
  invoices.filter(isUnpaid).reduce((sum, invoice) => sum + owed(invoice), 0)
