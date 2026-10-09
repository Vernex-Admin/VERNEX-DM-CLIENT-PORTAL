import type { InvoiceItemInsert, Minor } from '../types/db'

// Vernex and its clients are in the same state, so GST is CGST 9% + SGST 9% and IGST is 0.
const HALF_GST_RATE = 0.09

export type InvoiceTotals = {
  subtotal_minor: Minor
  cgst_minor: Minor
  sgst_minor: Minor
  igst_minor: Minor
  total_minor: Minor
}

export function itemAmount(item: InvoiceItemInsert): Minor {
  return Math.round(item.unit_price_minor * (item.quantity ?? 1))
}

export function invoiceTotals(items: InvoiceItemInsert[]): InvoiceTotals {
  const subtotal = items.reduce((sum, item) => sum + itemAmount(item), 0)
  const tax = Math.round(subtotal * HALF_GST_RATE)
  return { subtotal_minor: subtotal, cgst_minor: tax, sgst_minor: tax, igst_minor: 0, total_minor: subtotal + tax * 2 }
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 })

/** Paise to a display string with Indian grouping: 1770000 becomes "₹17,700". */
export function formatINR(minor: Minor): string {
  return inr.format(minor / 100)
}

/** Rupees typed by a person (`"15000"`, `"1,500.50"`) to paise. NaN when it is not a number. */
export function toMinor(rupees: string): Minor {
  const value = Number(rupees.replace(/[,\s]/g, ''))
  return Number.isFinite(value) && rupees.trim() !== '' ? Math.round(value * 100) : Number.NaN
}

/** Paise to the plain rupee number an input shows: 1500050 becomes "15000.5". */
export function toRupeesInput(minor: Minor): string {
  return String(minor / 100)
}
