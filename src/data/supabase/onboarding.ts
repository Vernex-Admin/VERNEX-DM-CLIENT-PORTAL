import type { Client, OnboardingItem } from '../../types/db'
import { DataError } from '../types'
import type { OnboardingGates, OnboardingRepo } from '../types'
import { supabase } from './client'
import { row, rows, toDataError } from './errors'

export const onboarding: OnboardingRepo = {
  // Clients get only the items that are theirs to do: row-level security filters the rest.
  list: (clientId) =>
    rows<OnboardingItem>(
      supabase().from('onboarding_items').select('*').eq('client_id', clientId).order('position', { ascending: true }),
    ),

  async generate(clientId, service) {
    const { data, error } = await supabase().rpc('generate_onboarding', { p_client_id: clientId, p_service: service })
    if (error) throw toDataError(error)
    return (data ?? []) as OnboardingItem[]
  },

  updateItem(id, patch) {
    const changes: Record<string, unknown> = {}
    if (patch.status !== undefined) {
      changes.status = patch.status
      changes.completed_at = patch.status === 'done' ? new Date().toISOString() : null
    }
    if (patch.due_date !== undefined) changes.due_date = patch.due_date
    if (patch.title !== undefined) changes.title = patch.title
    return row<OnboardingItem>(
      supabase().from('onboarding_items').update(changes).eq('id', id).select().single(),
      { PGRST116: "We couldn't find that checklist item." },
    )
  },

  async submit(answers, doneItemIds = []) {
    const { data, error } = await supabase().rpc('submit_onboarding', {
      p_answers: answers,
      p_done_item_ids: doneItemIds,
    })
    if (error) throw toDataError(error)
    return data as Client
  },

  async gates(clientId) {
    const { data, error } = await supabase().rpc('onboarding_gates', { p_client_id: clientId })
    if (error) throw toDataError(error)
    if (!data) throw new DataError('not_found', "We couldn't find that client.")
    return data as OnboardingGates
  },
}
