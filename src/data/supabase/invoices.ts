import { invoiceTotals, itemAmount } from '../../lib/money'
import type { Invoice, InvoiceItem, InvoiceItemInsert } from '../../types/db'
import { DataError } from '../types'
import type { InvoicesRepo } from '../types'
import { supabase } from './client'
import { cleanPatch, deleted, row, rows, toDataError } from './errors'

const NOT_FOUND = { PGRST116: "We couldn't find that invoice." }
const NO_ITEMS = 'An invoice needs at least one line item.'

const itemRows = (invoiceId: string, items: InvoiceItemInsert[]) =>
  items.map((item) => ({
    invoice_id: invoiceId,
    description: item.description,
    sac_code: item.sac_code ?? null,
    quantity: item.quantity ?? 1,
    unit_price_minor: item.unit_price_minor,
    amount_minor: itemAmount(item),
  }))

async function itemsOf(invoiceId: string): Promise<InvoiceItem[]> {
  return rows<InvoiceItem>(supabase().from('invoice_items').select('*').eq('invoice_id', invoiceId))
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
    let totals: Record<string, number> = {}
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
    await supabase().from('action_items').delete().eq('ref_type', 'invoice').eq('ref_id', id)
    await deleted(
      supabase().from('invoices').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that invoice."),
    )
  },
}
