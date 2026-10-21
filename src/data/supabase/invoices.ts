import { istDay } from '../../lib/dates'
import { nextMonthCopy, sameMonthCopy } from '../../lib/invoiceDocument'
import { invoiceTotals, itemAmount } from '../../lib/money'
import type { InvoiceTotals } from '../../lib/money'
import type { Invoice, InvoiceItem, InvoiceItemInsert } from '../../types/db'
import type { InvoiceEvent } from '../../types/invoiceDocument'
import { DataError } from '../types'
import type { InvoicesRepo } from '../types'
import { supabase } from './client'
import { cleanPatch, deleted, row, rows, toDataError } from './errors'

const NOT_FOUND = { PGRST116: "We couldn't find that invoice." }
const NO_ITEMS = 'An invoice needs at least one line item.'
const NUMBER_TAKEN = { '23505': 'That invoice number is already used. Choose another, or leave it empty to number it automatically.' }

const itemRows = (invoiceId: string, items: InvoiceItemInsert[]) =>
  items.map((item, index) => ({
    invoice_id: invoiceId,
    description: item.description,
    sac_code: item.sac_code ?? null,
    quantity: item.quantity ?? 1,
    unit_price_minor: item.unit_price_minor,
    amount_minor: itemAmount(item),
    position: index + 1,
    bill_period: item.bill_period ?? '',
  }))

async function itemsOf(invoiceId: string): Promise<InvoiceItem[]> {
  return rows<InvoiceItem>(
    supabase().from('invoice_items').select('*').eq('invoice_id', invoiceId).order('position', { ascending: true }),
  )
}

/** Calls one of the invoice functions in the migration; they return the invoice row. */
async function rpcInvoice(name: string, args: Record<string, unknown>): Promise<Invoice> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) throw toDataError(error, NUMBER_TAKEN)
  if (!data) throw new DataError('invalid', 'The invoice could not be updated. Try again.')
  return data as Invoice
}

export const invoices: InvoicesRepo = {
  // Clients never get drafts: the database hides them.
  list(filter = {}) {
    let query = supabase().from('invoices').select('*').order('created_at', { ascending: true })
    if (filter.client_id) query = query.eq('client_id', filter.client_id)
    return rows<Invoice>(query)
  },

  async get(id) {
    const invoice = await row<Invoice>(supabase().from('invoices').select('*').eq('id', id).single(), NOT_FOUND)
    return { ...invoice, items: await itemsOf(id) }
  },

  async create(input) {
    const { items, ...rest } = input
    if (items.length === 0) throw new DataError('invalid', NO_ITEMS)
    // The number is left empty on purpose: the database fills VX/26-27/0001.
    const invoice = await row<Invoice>(
      supabase()
        .from('invoices')
        .insert({ ...rest, ...invoiceTotals(items), number: '' })
        .select()
        .single(),
    )
    const { data, error } = await supabase().from('invoice_items').insert(itemRows(invoice.id, items)).select()
    if (error) {
      await supabase().from('invoices').delete().eq('id', invoice.id)
      throw toDataError(error)
    }
    return { ...invoice, items: (data ?? []) as InvoiceItem[] }
  },

  async update(id, { items, ...patch }) {
    let totals: Partial<InvoiceTotals> = {}
    if (items) {
      if (items.length === 0) throw new DataError('invalid', NO_ITEMS)
      totals = invoiceTotals(items)
      const previous = await itemsOf(id)
      const { error: removeError } = await supabase().from('invoice_items').delete().eq('invoice_id', id)
      if (removeError) throw toDataError(removeError)
      const { error } = await supabase().from('invoice_items').insert(itemRows(id, items))
      if (error) {
        // Put the old lines back so the invoice is not left empty.
        if (previous.length > 0) {
          await supabase()
            .from('invoice_items')
            .insert(
              previous.map((item) => ({
                invoice_id: id,
                description: item.description,
                sac_code: item.sac_code,
                quantity: item.quantity,
                unit_price_minor: item.unit_price_minor,
                amount_minor: item.amount_minor,
                position: item.position,
                bill_period: item.bill_period,
              })),
            )
        }
        throw toDataError(error)
      }
    }
    return row<Invoice>(
      supabase()
        .from('invoices')
        .update({ ...cleanPatch(patch), ...totals })
        .eq('id', id)
        .select()
        .single(),
      NOT_FOUND,
    )
  },

  async remove(id) {
    // Line items go with the invoice (cascade); open "invoice due" tasks for it go too.
    // The database refuses to delete an issued generator invoice.
    await supabase().from('action_items').delete().eq('ref_type', 'invoice').eq('ref_id', id)
    await deleted(
      supabase().from('invoices').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that invoice."),
    )
  },

  async saveDraft(input) {
    const invoice = await rpcInvoice('save_invoice_draft', {
      p_id: input.id,
      p_client_id: input.client_id,
      p_project_id: input.project_id,
      p_number: input.number,
      p_issue_date: input.issue_date,
      p_due_date: input.due_date,
      p_document: input.document,
      p_source_id: input.source_id ?? null,
    })
    return { ...invoice, items: await itemsOf(invoice.id) }
  },

  issue(id) {
    return rpcInvoice('issue_invoice', { p_id: id })
  },

  revise(id) {
    return rpcInvoice('revise_invoice', { p_id: id })
  },

  async duplicate(id, mode) {
    const source = await row<Invoice>(supabase().from('invoices').select('*').eq('id', id).single(), NOT_FOUND)
    if (!source.document) throw new DataError('invalid', 'Only Invoice Generator invoices can be duplicated.')
    const from = { document: source.document, issue_date: source.issue_date, due_date: source.due_date }
    const copy = mode === 'next_month' ? nextMonthCopy(from) : sameMonthCopy(from, istDay(new Date()))
    return invoices.saveDraft({
      id: null,
      client_id: source.client_id,
      project_id: source.project_id,
      number: '',
      ...copy,
      source_id: source.id,
    })
  },

  setPaymentStatus(id, input) {
    return rpcInvoice('set_invoice_payment_status', {
      p_id: id,
      p_status: input.status,
      p_amount_paid_minor: input.amount_paid_minor ?? null,
      p_note: input.note?.trim() || null,
    })
  },

  events(id) {
    return rows<InvoiceEvent>(
      supabase().from('invoice_events').select('*').eq('invoice_id', id).order('created_at', { ascending: true }),
    )
  },
}
