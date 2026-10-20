import type { MessageTemplate } from '../../types/db'
import { DataError } from '../types'
import type { TemplatesRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { row, rows } from './errors'

async function requireStaff() {
  const person = await requireProfile()
  if (person.client_id !== null) throw new DataError('forbidden', 'Only staff may access message templates.')
}

export const templates: TemplatesRepo = {
  async list() {
    await requireStaff()
    return rows<MessageTemplate>(supabase().from('message_templates').select('*').order('position', { ascending: true }))
  },

  async update(id, patch) {
    await requireStaff()
    if (patch.title !== undefined && !patch.title.trim()) throw new DataError('invalid', 'Title cannot be empty.')
    if (patch.body !== undefined && !patch.body.trim()) throw new DataError('invalid', 'Body cannot be empty.')
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.title !== undefined) changes.title = patch.title.trim()
    if (patch.subject !== undefined) changes.subject = patch.subject
    if (patch.body !== undefined) changes.body = patch.body
    return row<MessageTemplate>(
      supabase().from('message_templates').update(changes).eq('id', id).select().single(),
      { PGRST116: "We couldn't find that template." },
    )
  },
}
