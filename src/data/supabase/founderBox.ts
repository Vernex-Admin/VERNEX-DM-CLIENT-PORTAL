import type { Feedback } from '../../types/db'
import { DataError } from '../types'
import type { FounderBoxRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { maybeRow, row, rows } from './errors'

const ONLY_FOUNDER = { PGRST116: 'Only the founder can answer the Founder Box.', '42501': 'Only the founder can answer the Founder Box.' }

export const founderBox: FounderBoxRepo = {
  async send(input) {
    const author = await requireProfile()
    if (!author.client_id) throw new DataError('forbidden', 'Only client users can write to the founder.')
    return row<Feedback>(
      supabase()
        .from('feedback')
        .insert({
          client_id: author.client_id,
          kind: 'founder_box',
          founder_category: input.category,
          subject: input.subject,
          message: input.message,
          private_from_team: input.private_from_team ?? true,
          submitted_by: author.id,
          status: 'new',
        })
        .select()
        .single(),
    )
  },

  async listMine() {
    const author = await requireProfile()
    return rows<Feedback>(
      supabase()
        .from('feedback')
        .select('*')
        .eq('kind', 'founder_box')
        .eq('submitted_by', author.id)
        .order('created_at', { ascending: true }),
    )
  },

  async listInbox() {
    const person = await requireProfile()
    if (person.role !== 'vernex_founder') throw new DataError('forbidden', 'Only the founder reads the Founder Box.')
    return rows<Feedback>(
      supabase().from('feedback').select('*').eq('kind', 'founder_box').order('created_at', { ascending: false }),
    )
  },

  async reply(id, text) {
    if (!text.trim()) throw new DataError('invalid', 'Write a reply first.')
    const current = await maybeRow<{ status: Feedback['status'] }>(
      supabase().from('feedback').select('status').eq('id', id).eq('kind', 'founder_box').maybeSingle(),
    )
    if (!current) throw new DataError('not_found', "We couldn't find that message.")
    return row<Feedback>(
      supabase()
        .from('feedback')
        .update({
          reply: text.trim(),
          responded_at: new Date().toISOString(),
          status: current.status === 'new' ? 'acknowledged' : current.status,
        })
        .eq('id', id)
        .select()
        .single(),
      ONLY_FOUNDER,
    )
  },

  // The database lets only the founder update a message.
  setStatus: (id, status) =>
    row<Feedback>(supabase().from('feedback').update({ status }).eq('id', id).select().single(), ONLY_FOUNDER),
}
