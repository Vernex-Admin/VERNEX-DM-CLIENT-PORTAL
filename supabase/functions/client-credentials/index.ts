import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Client logins. Runs with the service role because it sets Supabase Auth passwords.
//
//   { action: 'issue', profile_id, password }
//     Vernex staff only (a PM only for their assigned clients). Sets up the person's login, or
//     gives them a new password. The first person of a client gets the Client Code as their login
//     code; every further person gets the code and a number (VXC-1001-2).
//   { action: 'change_own', current_password, new_password }
//     A signed-in client user changes their own password after proving the current one.
//
// The rules match src/lib/credentials.ts.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const fail = (error: string, status = 400) => json({ error }, status)

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function passwordError(password: unknown): string | null {
  if (typeof password !== 'string') return 'Enter a password.'
  if (password.length < 8) return 'Use at least 8 characters.'
  if (password.length > 72) return 'Use at most 72 characters.'
  if (/\s/.test(password)) return 'Leave out spaces.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.'
  return null
}

function nextLoginCode(clientCode: string, taken: Set<string>) {
  if (!taken.has(clientCode)) return clientCode
  for (let n = 2; n < 1000; n++) {
    const candidate = `${clientCode}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return null
}

type Profile = {
  id: string
  user_id: string | null
  client_id: string | null
  email: string
  full_name: string
  role: string
  is_active: boolean
  login_code: string | null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return fail('Method not allowed.', 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return fail('This service is temporarily unavailable. Please try again later.', 503)
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Who is calling: their Supabase session, then their active profile.
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return fail('Your session has ended. Sign in again.', 401)
  const { data: caller } = await admin
    .from('profiles')
    .select('id,user_id,client_id,email,full_name,role,is_active,login_code')
    .eq('user_id', userData.user.id)
    .eq('is_active', true)
    .maybeSingle<Profile>()
  if (!caller) return fail('Your session has ended. Sign in again.', 401)

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return fail('Check the details and try again.')
  }

  if (input.action === 'issue') {
    if (caller.role !== 'vernex_founder' && caller.role !== 'vernex_pm') {
      return fail('Only Vernex staff can set up logins.', 403)
    }
    const problem = passwordError(input.password)
    if (problem) return fail(problem)
    const password = input.password as string
    if (typeof input.profile_id !== 'string') return fail('Choose a person.')

    const { data: person } = await admin
      .from('profiles')
      .select('id,user_id,client_id,email,full_name,role,is_active,login_code')
      .eq('id', input.profile_id)
      .maybeSingle<Profile>()
    if (!person || !person.client_id) return fail('Only client users sign in with a Client Code.', 404)

    if (caller.role === 'vernex_pm') {
      const { data: assigned } = await admin
        .from('client_assignments')
        .select('client_id')
        .eq('client_id', person.client_id)
        .eq('user_id', caller.id)
        .maybeSingle()
      if (!assigned) return fail('That client is not assigned to you.', 403)
    }

    const { data: client } = await admin.from('clients').select('client_code').eq('id', person.client_id).single()
    if (!client?.client_code) return fail('This client has no Client Code yet. Apply the latest database migration.', 409)

    let loginCode = person.login_code
    if (!loginCode) {
      const { data: used } = await admin
        .from('profiles')
        .select('login_code')
        .eq('client_id', person.client_id)
        .not('login_code', 'is', null)
      loginCode = nextLoginCode(client.client_code, new Set((used ?? []).map((row) => row.login_code as string)))
      if (!loginCode) return fail('This client has too many logins.', 409)
    }

    // The Supabase Auth account: created the first time (the database links it to the profile by
    // email), otherwise its password is replaced.
    if (person.user_id) {
      const { error } = await admin.auth.admin.updateUserById(person.user_id, { password })
      if (error) return fail('Could not set the password. Try again.', 500)
    } else {
      const { error } = await admin.auth.admin.createUser({
        email: person.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: person.full_name },
      })
      if (error) {
        return fail(
          /already/i.test(error.message)
            ? 'Another account already uses this email address. Change the person’s email and try again.'
            : 'Could not create the login. Try again.',
          500,
        )
      }
    }

    const { error: codeError } = await admin.from('profiles').update({ login_code: loginCode }).eq('id', person.id)
    if (codeError) return fail('Could not save the login code. Try again.', 500)
    const { error: hashError } = await admin
      .from('profile_login_codes')
      .upsert({ profile_id: person.id, code_hash: await sha256(loginCode), created_at: new Date().toISOString() })
    if (hashError) return fail('Could not save the login code. Try again.', 500)

    const { data: credential, error: saveError } = await admin
      .from('client_credentials')
      .upsert({
        profile_id: person.id,
        client_id: person.client_id,
        login_code: loginCode,
        password,
        set_by: 'vernex',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (saveError) return fail('Could not save the password. Try again.', 500)
    return json(credential)
  }

  if (input.action === 'change_own') {
    if (!caller.client_id) return fail('Vernex staff change their password from Supabase.', 403)
    if (!caller.login_code) return fail('Your login is managed by Vernex. Ask your account manager.')
    if (typeof input.current_password !== 'string' || !input.current_password) {
      return fail('Enter your current password.')
    }
    const problem = passwordError(input.new_password)
    if (problem) return fail(problem)
    const newPassword = input.new_password as string
    if (newPassword === input.current_password) return fail('Choose a password different from the current one.')

    // Supabase Auth checks the current password; nothing here compares passwords itself.
    const check = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userData.user.email, password: input.current_password }),
    })
    if (check.status === 429) return fail('Too many attempts. Wait a few minutes and try again.', 429)
    if (!check.ok) return fail('Your current password is not correct.')

    const { error } = await admin.auth.admin.updateUserById(userData.user.id, { password: newPassword })
    if (error) return fail('Could not change your password. Try again.', 500)
    const { error: saveError } = await admin.from('client_credentials').upsert({
      profile_id: caller.id,
      client_id: caller.client_id,
      login_code: caller.login_code,
      password: newPassword,
      set_by: 'client',
      updated_at: new Date().toISOString(),
    })
    if (saveError) return fail('Your password changed, but Vernex’s copy could not be updated.', 500)
    return json({ ok: true })
  }

  return fail('Unknown action.')
})
