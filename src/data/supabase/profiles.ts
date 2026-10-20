import type { ClientAssignment, NotificationPrefs, Profile } from '../../types/db'
import { DataError } from '../types'
import type { ProfilesRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { cleanPatch, deleted, maybeRow, row, rows, toDataError } from './errors'

const DUPLICATE_EMAIL = { '23505': 'Someone already uses that email address.' }

export const profiles: ProfilesRepo = {
  listByClient: (clientId) =>
    rows<Profile>(
      supabase().from('profiles').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
    ),

  async getAccountLead(clientId) {
    const lead = await maybeRow<{ user_id: string }>(
      supabase()
        .from('client_assignments')
        .select('user_id')
        .eq('client_id', clientId)
        .eq('is_account_lead', true)
        .maybeSingle(),
    )
    if (!lead) return null
    return maybeRow<Profile>(supabase().from('profiles').select('*').eq('id', lead.user_id).maybeSingle())
  },

  listStaff: () =>
    rows<Profile>(
      supabase()
        .from('profiles')
        .select('*')
        .is('client_id', null)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    ),

  listAccountLeads: () =>
    rows<ClientAssignment>(supabase().from('client_assignments').select('*').eq('is_account_lead', true)),

  async setAccountLead(clientId, userId) {
    const { data, error } = await supabase().rpc('set_account_lead', { p_client_id: clientId, p_user_id: userId })
    if (error) throw toDataError(error)
    return data as ClientAssignment
  },

  createStaff: ({ email, full_name }) =>
    row<Profile>(
      supabase()
        .from('profiles')
        .insert({ email: email.trim(), full_name: full_name.trim(), role: 'vernex_pm', client_id: null })
        .select()
        .single(),
      { ...DUPLICATE_EMAIL, '42501': 'Only the founder can add Vernex team members.' },
    ),

  setActive: async (id, isActive) => {
    const me = await requireProfile()
    if (me.id === id) throw new DataError('invalid', 'You cannot deactivate yourself.')
    return row<Profile>(
      supabase().from('profiles').update({ is_active: isActive }).eq('id', id).is('client_id', null).select().single(),
      { PGRST116: "We couldn't find that team member." },
    )
  },

  listAssignments: () => rows<ClientAssignment>(supabase().from('client_assignments').select('*')),

  async assignToClient(clientId, userId) {
    const existing = await maybeRow<ClientAssignment>(
      supabase()
        .from('client_assignments')
        .select('*')
        .eq('client_id', clientId)
        .eq('user_id', userId)
        .maybeSingle(),
    )
    if (existing) return existing
    return row<ClientAssignment>(
      supabase()
        .from('client_assignments')
        .insert({ client_id: clientId, user_id: userId, is_account_lead: false })
        .select()
        .single(),
    )
  },

  async unassignFromClient(clientId, userId) {
    const existing = await maybeRow<ClientAssignment>(
      supabase()
        .from('client_assignments')
        .select('*')
        .eq('client_id', clientId)
        .eq('user_id', userId)
        .maybeSingle(),
    )
    if (existing?.is_account_lead) {
      throw new DataError('invalid', 'Choose another account lead for this client first.')
    }
    await deleted(
      supabase().from('client_assignments').delete().eq('client_id', clientId).eq('user_id', userId).select('user_id'),
      new DataError('not_found', 'That assignment no longer exists.'),
    )
  },

  createClientUser(input) {
    if (input.role !== 'client_admin' && input.role !== 'client_member') {
      return Promise.reject(new DataError('invalid', 'A client user must be a client admin or a client member.'))
    }
    return row<Profile>(
      supabase()
        .from('profiles')
        .insert({
          email: input.email.trim(),
          full_name: input.full_name,
          role: input.role,
          client_id: input.client_id,
          can_approve: input.can_approve ?? input.role === 'client_admin',
          phone_e164: input.phone_e164 ?? null,
        })
        .select()
        .single(),
      DUPLICATE_EMAIL,
    )
  },

  async updateMe(patch) {
    const { data, error } = await supabase().rpc('update_me', {
      p_full_name: patch.full_name ?? null,
      p_phone_e164: patch.phone_e164 ?? null,
      p_notification_prefs: (patch.notification_prefs as NotificationPrefs | undefined) ?? null,
    })
    if (error) throw toDataError(error)
    return data as Profile
  },

  update: (id, patch) =>
    row<Profile>(
      supabase()
        .from('profiles')
        .update(cleanPatch(patch, ['user_id']))
        .eq('id', id)
        .select()
        .single(),
      { ...DUPLICATE_EMAIL, PGRST116: "We couldn't find that person." },
    ),

  remove: (id) =>
    deleted(
      supabase().from('profiles').delete().eq('id', id).select('id'),
      new DataError('forbidden', "You can't remove that person."),
    ),
}
