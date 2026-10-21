import type { Session } from '@supabase/supabase-js'
import { NOT_INVITED_MESSAGE, clearReturnPath, isNotInvited } from '../../lib/authMessages'
import type { Profile } from '../../types/db'
import { DataError } from '../types'
import type { AuthRepo, AuthSession, SessionRepo } from '../types'
import { supabase } from './client'
import { toDataError } from './errors'

const callbackUrl = () => `${window.location.origin}/auth/callback`

function toSession(session: Session): AuthSession {
  const meta = session.user.user_metadata as { full_name?: string } | null
  return {
    user: { id: session.user.id, email: session.user.email ?? '', user_metadata: { full_name: meta?.full_name ?? '' } },
    expires_at: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  }
}

/** Auth errors are written for people already; only the invite-only refusal needs rewording. */
function authError(error: { message: string }): DataError {
  if (isNotInvited(error.message)) return new DataError('forbidden', NOT_INVITED_MESSAGE)
  return new DataError('invalid', error.message || 'Could not send the sign-in link. Try again.')
}

export const supabaseAuth: AuthRepo = {
  async getSession() {
    const { data, error } = await supabase().auth.getSession()
    if (error) throw authError(error)
    return data.session ? toSession(data.session) : null
  },

  async signInWithIdentifier({ identifier, password }) {
    const value = identifier.trim()
    const isEmail = /^\S+@\S+\.\S+$/.test(value)
    if (!isEmail && !/^[a-z0-9-]{6,64}$/i.test(value)) {
      throw new DataError('invalid', 'Enter a valid Client Code or email address.')
    }
    if (!password) throw new DataError('invalid', 'Enter your password.')

    const { data, error } = await supabase().functions.invoke('login-with-identifier', {
      body: { identifier: isEmail ? value.toLowerCase() : value.toUpperCase(), password },
    })
    let serverMessage: string | undefined
    if (error?.context instanceof Response) {
      try {
        const body = await error.context.json() as { error?: unknown }
        if (typeof body.error === 'string') serverMessage = body.error
      } catch {
        // Use the generic message when the Edge Function response isn't JSON.
      }
    }
    if (error || !data?.access_token || !data?.refresh_token) {
      throw new DataError('invalid', serverMessage || 'Invalid identifier or password. Try again.')
    }

    const { data: sessionData, error: sessionError } = await supabase().auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    if (sessionError) throw authError(sessionError)
    if (!sessionData.session) throw new DataError('invalid', 'Could not start your session. Try again.')
    return toSession(sessionData.session)
  },

  async signInWithPassword({ email, password }) {
    const address = email.trim().toLowerCase()
    const { data, error } = await supabase().auth.signInWithPassword({ email: address, password: password || '' })
    if (error) throw authError(error)
    if (!data.session) throw new DataError('invalid', 'Invalid credentials. Please try again.')
    return toSession(data.session)
  },

  async signInWithOtp({ email }) {
    const address = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(address)) throw new DataError('invalid', 'Enter a valid email address.')
    const { error } = await supabase().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl() },
    })
    if (error) throw authError(error)
  },

  verifyOtp() {
    return Promise.reject(new DataError('forbidden', 'Open the link in your email to sign in.'))
  },

  async signInWithOAuth({ provider }) {
    const { error } = await supabase().auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl() } })
    if (error) throw authError(error)
    // The browser is on its way to Google and this page is replaced, so there is nothing to resolve.
    return new Promise<AuthSession>(() => {})
  },

  async signOut() {
    clearReturnPath()
    const { error } = await supabase().auth.signOut()
    if (error) throw authError(error)
  },

  onAuthChange(listener) {
    let lastUserId: string | null = null
    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      const userId = session?.user.id ?? null
      const previous = lastUserId
      lastUserId = userId
      // Token refreshes and tab-focus re-checks are not a change of person.
      let change: 'signed_in' | 'signed_out' | null = null
      if (event === 'SIGNED_OUT' && previous !== null) change = 'signed_out'
      else if (event === 'SIGNED_IN' && userId !== previous) change = 'signed_in'
      // Supabase asks callbacks not to call back into its client from inside the callback.
      if (change) {
        const detected = change
        setTimeout(() => listener(detected), 0)
      }
    })
    return () => data.subscription.unsubscribe()
  },
}

export const supabaseSession: SessionRepo = {
  async getCurrentProfile() {
    const sb = supabase()
    const { data: sessionData } = await sb.auth.getSession()
    if (!sessionData.session) return null
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('user_id', sessionData.session.user.id)
      .maybeSingle()
    if (error) throw toDataError(error)
    if (!data || !(data as Profile).is_active) return null
    return data as Profile
  },

  listSwitchableProfiles: () => Promise.resolve([]),

  switchProfile: () => Promise.reject(new DataError('forbidden', 'Not available')),
}

/** The signed-in person's own profile, or a DataError when signed out. */
export async function requireProfile(): Promise<Profile> {
  const { data: sessionData } = await supabase().auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) throw new DataError('signed_out', 'You are signed out.')
  const { data, error } = await supabase().from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw toDataError(error)
  if (!data) throw new DataError('signed_out', 'You are signed out.')
  return data as Profile
}
