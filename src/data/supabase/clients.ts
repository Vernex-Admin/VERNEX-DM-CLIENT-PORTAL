import type { Client } from '../../types/db'
import { DataError } from '../types'
import type { ClientsRepo } from '../types'
import { supabase } from './client'
import { requireProfile } from './auth'
import { cleanPatch, deleted, row, rows, toDataError } from './errors'
import { discardUploads } from './storage'

// The columns create_client() reads from its jsonb argument.
const CREATE_KEYS = [
  'name',
  'slug',
  'logo_url',
  'industry',
  'city',
  'gstin',
  'billing_email',
  'retainer_minor',
  'retainer_months',
  'service_type',
] as const

const NOT_FOUND = { PGRST116: "We couldn't find that client." }

export const clients: ClientsRepo = {
  list: () => rows<Client>(supabase().from('clients').select('*').order('created_at', { ascending: true })),

  get: (id) => row<Client>(supabase().from('clients').select('*').eq('id', id).single(), NOT_FOUND),

  async create(input) {
    const payload = Object.fromEntries(CREATE_KEYS.map((key) => [key, input[key] ?? null]))
    const { data, error } = await supabase().rpc('create_client', { p_client: payload })
    if (error) throw toDataError(error)
    return data as Client
  },

  update: (id, patch) =>
    row<Client>(supabase().from('clients').update(cleanPatch(patch)).eq('id', id).select().single(), NOT_FOUND),

  async remove(id) {
    const person = await requireProfile()
    if (person.role !== 'vernex_founder') throw new DataError('forbidden', 'Only the founder can delete a client.')
    // The files rows go with the client, and the vault rules only let staff delete objects of a
    // client that still exists, so the stored files are removed first.
    const stored = await rows<{ storage_key: string }>(
      supabase().from('files').select('storage_key').eq('client_id', id).neq('storage_key', ''),
    )
    await discardUploads(stored.map((file) => file.storage_key))
    await deleted(
      supabase().from('clients').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that client."),
    )
  },
}
