import type { Deliverable, Revision } from '../../types/db'
import type { RevisionsRepo } from '../types'
import { supabase } from './client'
import { cleanPatch, row, rows, toDataError } from './errors'

export const revisions: RevisionsRepo = {
  list: (filter) =>
    rows<Revision>(
      supabase()
        .from('revisions')
        .select('*')
        .eq('deliverable_id', filter.deliverable_id)
        .order('revision_number', { ascending: true }),
    ),

  async request(input) {
    const { data, error } = await supabase().rpc('request_revision', {
      p_deliverable_id: input.deliverable_id,
      p_description: input.description,
      p_revision_type: input.revision_type ?? 'other',
      p_priority: input.priority ?? 'normal',
      p_attachment_names: input.attachment_names ?? [],
      // The form makes one key per submission, so a double-click is counted once.
      p_idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
    })
    if (error) throw toDataError(error)
    return data as Revision
  },

  update: (id, patch) =>
    row<Revision>(
      supabase()
        .from('revisions')
        .update(cleanPatch(patch, ['deliverable_id', 'idempotency_key']))
        .eq('id', id)
        .select()
        .single(),
      { PGRST116: "We couldn't find that revision." },
    ),

  async grantBonus({ deliverable_id, reason }) {
    const { data, error } = await supabase().rpc('grant_bonus_revision', {
      p_deliverable_id: deliverable_id,
      p_reason: reason,
    })
    if (error) throw toDataError(error)
    return data as Deliverable
  },
}
