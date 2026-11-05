import { createClient } from '@supabase/supabase-js'
import process from 'node:process'
import { URL } from 'node:url'

const adminEmail = 'admin@vernexgentech.in'
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const expectedProjectRef = process.env.SUPABASE_PROJECT_REF

if (!supabaseUrl || !serviceRoleKey || !expectedProjectRef) {
  throw new Error('Set SUPABASE_URL, SUPABASE_PROJECT_REF, and SUPABASE_SERVICE_ROLE_KEY in the secure shell environment.')
}

const parsedUrl = new URL(supabaseUrl)
const actualProjectRef = parsedUrl.hostname.split('.')[0]
if (parsedUrl.protocol !== 'https:' || actualProjectRef !== expectedProjectRef) {
  throw new Error('SUPABASE_URL does not match SUPABASE_PROJECT_REF. No changes were made.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findAuthUserByEmail() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Could not inspect Supabase Auth users: ${error.message}`)
    const found = data.users.find((user) => user.email?.toLowerCase() === adminEmail)
    if (found) return found
    if (data.users.length < 1000) return null
  }
}

const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('id,user_id,email,role,is_active')
  .ilike('email', adminEmail)
  .maybeSingle()
if (profileError) throw new Error(`Could not inspect the finance admin profile: ${profileError.message}`)

const authUser = await findAuthUserByEmail()
const resetPassword = process.env.FINANCE_ADMIN_RESET_PASSWORD
if (resetPassword && resetPassword.length < 12) {
  throw new Error('FINANCE_ADMIN_RESET_PASSWORD must be at least 12 characters.')
}
if (resetPassword && !authUser) {
  throw new Error('No existing Auth account was found to reset. Use FINANCE_ADMIN_INITIAL_PASSWORD to create it.')
}

const initialPassword = authUser ? null : process.env.FINANCE_ADMIN_INITIAL_PASSWORD
if (!authUser && (!initialPassword || initialPassword.length < 12)) {
  throw new Error('No Auth account exists. Set FINANCE_ADMIN_INITIAL_PASSWORD to a unique password of at least 12 characters in the secure shell environment, then rerun.')
}

if (profile && (profile.role !== 'vernex_finance' || !profile.is_active)) {
  throw new Error('An inactive or non-finance profile already uses the finance admin email. Resolve it through the existing admin process; no changes were made.')
}
if (profile?.user_id && authUser && profile.user_id !== authUser.id) {
  throw new Error('The finance admin profile is linked to a different Auth user. No changes were made.')
}

if (!profile) {
  const { error } = await supabase.from('profiles').insert({
    email: adminEmail,
    full_name: 'Vernex Gentech Admin',
    role: 'vernex_finance',
    is_active: true,
  })
  if (error) throw new Error(`Could not create the finance admin profile: ${error.message}`)
}

let provisionedUser = authUser
if (!provisionedUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Vernex Gentech Admin' },
  })
  if (error) throw new Error(`Could not create the Supabase Auth user: ${error.message}`)
  provisionedUser = data.user
}

if (authUser && resetPassword) {
  const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, { password: resetPassword })
  if (error) throw new Error(`Could not reset the finance admin password: ${error.message}`)
  provisionedUser = data.user
}

const { data: verifiedProfile, error: verifyError } = await supabase
  .from('profiles')
  .select('user_id,role,is_active')
  .ilike('email', adminEmail)
  .maybeSingle()
if (verifyError) throw new Error(`Auth user exists, but profile verification failed: ${verifyError.message}`)
if (!verifiedProfile || verifiedProfile.user_id !== provisionedUser.id || verifiedProfile.role !== 'vernex_finance' || !verifiedProfile.is_active) {
  throw new Error('Auth user exists, but the finance profile link did not verify. Review the profile through the existing admin process.')
}

process.stdout.write(`Verified active vernex_finance account for ${adminEmail} in Supabase project ${actualProjectRef}.\n`)
if (authUser && resetPassword) {
  process.stdout.write('Existing Auth password was reset using the one-time environment password.\n')
} else {
  process.stdout.write(authUser ? 'Existing Auth password was preserved.\n' : 'New Auth user created with the one-time environment password.\n')
}
