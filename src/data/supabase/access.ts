import type { ClientCredential } from '../../types/db'
import type { ClientAccessRepo } from '../types'
import { supabase } from './client'
import { invokeFunction } from './edge'
import { rows } from './errors'

// Passwords live in Supabase Auth; the client-credentials Edge Function (service role) is the only
// thing that sets them. Staff read the current ones through list_client_credentials(), which
// checks they are staff and the client is theirs.

export const access: ClientAccessRepo = {
  list: () => rows<ClientCredential>(supabase().rpc('list_client_credentials')),

  issue: ({ profile_id, password }) =>
    invokeFunction<ClientCredential>(
      'client-credentials',
      { action: 'issue', profile_id, password },
      'Could not set up the login. Try again.',
    ),

  async changeMyPassword({ current_password, new_password }) {
    await invokeFunction<{ ok: true }>(
      'client-credentials',
      { action: 'change_own', current_password, new_password },
      'Could not change your password. Try again.',
    )
  },
}
