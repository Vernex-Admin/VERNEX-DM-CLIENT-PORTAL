import type { AiDraft } from '../../types/db'
import { DataError } from '../types'
import type { AiDraftsRepo } from '../types'
import { supabase } from './client'
import { maybeRow, row, rows } from './errors'

async function current(id: string): Promise<AiDraft> {
  const draft = await maybeRow<AiDraft>(supabase().from('ai_drafts').select('*').eq('id', id).maybeSingle())
  if (!draft) throw new DataError('not_found', "We couldn't find that draft.")
  return draft
}

const save = (id: string, changes: Record<string, unknown>) =>
  row<AiDraft>(
    supabase()
      .from('ai_drafts')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
  )

export const aiDrafts: AiDraftsRepo = {
  list: () => rows<AiDraft>(supabase().from('ai_drafts').select('*').order('created_at', { ascending: false })),

  async update(id, patch) {
    const draft = await current(id)
    if (draft.status !== 'draft') throw new DataError('invalid', 'Only a draft can be edited.')
    if (patch.body !== undefined && !patch.body.trim()) throw new DataError('invalid', 'The text cannot be empty.')
    return save(id, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
    })
  },

  async approve(id) {
    const draft = await current(id)
    if (draft.status !== 'draft') throw new DataError('invalid', 'Only a draft can be approved.')
    return save(id, { status: 'approved' })
  },

  async markSent(id) {
    const draft = await current(id)
    if (draft.status !== 'approved') throw new DataError('invalid', 'Approve a draft before sending it.')
    return save(id, { status: 'sent' })
  },
}
