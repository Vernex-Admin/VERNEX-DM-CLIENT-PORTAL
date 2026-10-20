import { STAGE_LABEL } from '../../lib/leads'
import type { Client, Lead, LeadActivity } from '../../types/db'
import { DataError } from '../types'
import type { LeadInsert, LeadsRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { cleanPatch, deleted, maybeRow, row, rows, toDataError } from './errors'

const NOT_FOUND = { PGRST116: "We couldn't find that lead." }

async function log(leadId: string, kind: LeadActivity['kind'], text: string, by: string) {
  const { error } = await supabase().from('lead_activity').insert({ lead_id: leadId, kind, text, by })
  if (error) throw toDataError(error)
}

function checked(input: LeadInsert): LeadInsert {
  if (!input.company?.trim()) throw new DataError('invalid', 'A lead needs a company name.')
  if (input.score != null && (input.score < 0 || input.score > 100)) {
    throw new DataError('invalid', 'Score is between 0 and 100.')
  }
  return { country: 'India', ...input, company: input.company.trim() }
}

export const leads: LeadsRepo = {
  list: () => rows<Lead>(supabase().from('leads').select('*').order('created_at', { ascending: true })),

  async create(input) {
    const by = await requireProfile()
    const lead = await row<Lead>(supabase().from('leads').insert(checked(input)).select().single())
    await log(lead.id, 'created', 'Lead added', by.id)
    return lead
  },

  async update(id, patch) {
    const by = await requireProfile()
    const before = await maybeRow<Lead>(supabase().from('leads').select('*').eq('id', id).maybeSingle())
    if (!before) throw new DataError('not_found', "We couldn't find that lead.")
    if (patch.company !== undefined && !patch.company.trim()) throw new DataError('invalid', 'A lead needs a company name.')
    if (patch.score != null && (patch.score < 0 || patch.score > 100)) {
      throw new DataError('invalid', 'Score is between 0 and 100.')
    }
    const changed = Object.entries(patch).filter(
      ([key, value]) => key !== 'stage' && before[key as keyof Lead] !== value,
    )
    const lead = await row<Lead>(
      supabase().from('leads').update(cleanPatch(patch, ['converted_client_id'])).eq('id', id).select().single(),
      NOT_FOUND,
    )
    if (patch.stage && patch.stage !== before.stage) {
      await log(id, 'stage', `Moved from ${STAGE_LABEL[before.stage]} to ${STAGE_LABEL[patch.stage]}`, by.id)
    }
    if (changed.length > 0) {
      await log(id, 'edit', `Edited ${changed.map(([key]) => key.replaceAll('_', ' ')).join(', ')}`, by.id)
    }
    return lead
  },

  remove: (id) =>
    deleted(
      supabase().from('leads').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that lead."),
    ),

  listActivity: (leadId) =>
    rows<LeadActivity>(
      supabase().from('lead_activity').select('*').eq('lead_id', leadId).order('created_at', { ascending: true }),
    ),

  async importMany(input) {
    if (input.some((item) => !item.company?.trim())) throw new DataError('invalid', 'Every row needs a company.')
    if (input.length === 0) return []
    const by = await requireProfile()
    const created = await rows<Lead>(supabase().from('leads').insert(input.map(checked)).select())
    const { error } = await supabase()
      .from('lead_activity')
      .insert(created.map((lead) => ({ lead_id: lead.id, kind: 'imported', text: 'Imported from CSV', by: by.id })))
    if (error) throw toDataError(error)
    return created
  },

  async convertToClient(id) {
    const { data, error } = await supabase().rpc('convert_lead_to_client', { p_lead_id: id })
    if (error) throw toDataError(error)
    return data as Client
  },
}
