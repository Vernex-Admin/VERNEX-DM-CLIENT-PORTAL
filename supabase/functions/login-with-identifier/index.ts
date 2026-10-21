import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  let input: { identifier?: unknown; password?: unknown }
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Invalid identifier or password. Try again.' }, 400)
  }

  const identifier = typeof input.identifier === 'string' ? input.identifier.trim() : ''
  const isEmail = /^\S+@\S+\.\S+$/.test(identifier)
  const normalizedIdentifier = isEmail ? identifier.toLowerCase() : identifier.toUpperCase()
  const password = typeof input.password === 'string' ? input.password : ''
  if (!(isEmail || /^[A-Z0-9-]{6,64}$/.test(normalizedIdentifier)) || password.length < 1 || password.length > 1024) {
    return json({ error: 'Invalid identifier or password. Try again.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, 503)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const remoteAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('cf-connecting-ip')?.trim()
  if (remoteAddress) {
    const ipHash = await sha256(`${serviceRoleKey}:${remoteAddress}`)
    const { data: allowed, error: rateError } = await admin.rpc('consume_client_code_login_attempt', {
      p_ip_hash: ipHash,
    })
    if (rateError) return json({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, 503)
    if (!allowed) return json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' }, 429)
  }

  let accountEmail: string | undefined
  if (isEmail) {
    const { data: profile, error: lookupError } = await admin
      .from('profiles')
      .select('email,is_active')
      .eq('email', normalizedIdentifier)
      .eq('is_active', true)
      .maybeSingle()
    if (!lookupError && profile?.is_active) accountEmail = profile.email
  } else {
    const codeHash = await sha256(normalizedIdentifier)
    const { data: row, error: lookupError } = await admin
      .from('profile_login_codes')
      .select('profiles!inner(email,is_active)')
      .eq('code_hash', codeHash)
      .eq('profiles.is_active', true)
      .maybeSingle()

    const profile = row?.profiles as { email?: string; is_active?: boolean } | null
    if (!lookupError && profile?.is_active) accountEmail = profile.email
  }

  if (!accountEmail) {
    return json({ error: 'Invalid identifier or password. Try again.' }, 401)
  }

  // The email stays on the server. Supabase Auth still verifies the actual password and issues
  // the session; the client never gets an account lookup endpoint or a hardcoded credential.
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: accountEmail, password }),
  })

  if (authResponse.status === 429) {
    return json({ error: 'Too many sign-in attempts. Wait a few minutes and try again.' }, 429)
  }
  if (!authResponse.ok) return json({ error: 'Invalid identifier or password. Try again.' }, 401)

  const session = await authResponse.json()
  return json(session)
})
