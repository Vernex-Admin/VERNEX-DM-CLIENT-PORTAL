import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DataError } from '../types'

let instance: SupabaseClient | null = null

/**
 * The one Supabase client. Created on first use so the mock build never needs the keys.
 * Only the anon (publishable) key belongs here; row-level security does the rest.
 */
export function supabase(): SupabaseClient {
  if (instance) return instance
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) {
    // People never see setup details; the console tells whoever deployed it what to set.
    console.error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    throw new DataError('invalid', 'The portal is not set up yet. Contact Vernex.')
  }
  instance = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return instance
}
