import type { ActionItem } from '../../types/db'
import { DataError } from '../types'
import type { ActionItemsRepo } from '../types'
import { supabase } from './client'
import { cleanPatch, deleted, row, rows } from './errors'

export const actionItems: ActionItemsRepo = {
  list(filter = {}) {
    let query = supabase().from('action_items').select('*').order('created_at', { ascending: true })
    if (filter.client_id) query = query.eq('client_id', filter.client_id)
    if (filter.open === true) query = query.is('resolved_at', null)
    if (filter.open === false) query = query.not('resolved_at', 'is', null)
    return rows<ActionItem>(query)
  },

  create: (input) => row<ActionItem>(supabase().from('action_items').insert(input).select().single()),

  async resolve(id) {
    const item = await row<ActionItem>(
      supabase().from('action_items').select('*').eq('id', id).single(),
      { PGRST116: "We couldn't find that item." },
    )
    if (item.resolved_at) return item
    return row<ActionItem>(
      supabase()
        .from('action_items')
        .update(cleanPatch({ resolved_at: new Date().toISOString() }))
        .eq('id', id)
        .select()
        .single(),
      { PGRST116: "You can't resolve that item." },
    )
  },

  remove: (id) =>
    deleted(
      supabase().from('action_items').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that item."),
    ),
}
