import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildAgreementPdf } from '../../../src/lib/agreementPdf.ts'
import { appendClosingPage } from '../../../src/lib/agreementClosingPage.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!token || !url || !serviceKey) return json({ error: 'Sign in is required.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Sign in is required.' }, 401)
  let input: { agreement_id?: unknown }
  try { input = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  if (typeof input.agreement_id !== 'string') return json({ error: 'Agreement not found.' }, 404)

  const { data: agreement, error: agreementError } = await admin.from('agreements').select('*')
    .eq('id', input.agreement_id).maybeSingle()
  if (agreementError || !agreement || agreement.status !== 'signed') return json({ error: 'Signed agreement not found.' }, 404)
  if (!agreement.client_signed_at || !agreement.client_timezone) return json({ error: 'The client signing time is incomplete.' }, 409)

  const { data: profile } = await admin.from('profiles').select('id,user_id,role,client_id,full_name')
    .eq('user_id', authData.user.id).eq('is_active', true).maybeSingle()
  let allowed = profile?.role === 'vernex_founder'
    || (profile?.client_id === agreement.client_id && (profile?.role === 'client_admin' || profile?.role === 'client_member'))
  if (profile?.role === 'vernex_pm') {
    const { data: assignment } = await admin.from('client_assignments').select('client_id')
      .eq('user_id', profile.id).eq('client_id', agreement.client_id).maybeSingle()
    allowed = Boolean(assignment)
  }
  if (!allowed) return json({ error: 'You cannot access this agreement.' }, 403)
  if (agreement.signed_pdf_path) return json({ path: agreement.signed_pdf_path })

  const downloadSignature = async (path: string) => {
    const { data, error } = await admin.storage.from('agreements').download(path)
    if (error || !data) throw new Error('A stored signature is missing.')
    return new Uint8Array(await data.arrayBuffer())
  }

  try {
    const founderProfile = await admin.from('profiles').select('full_name').eq('user_id', agreement.founder_user_id).maybeSingle()
    const clientProfile = await admin.from('profiles').select('full_name').eq('user_id', agreement.client_user_id).maybeSingle()
    const clientSignature = await downloadSignature(agreement.client_signature_path)
    // The same builder and closing page as the admin preview, so the signed PDF matches it exactly.
    const letterhead = await Deno.readFile(new URL('./agreement-letterhead.pdf', import.meta.url))
    const closingPage = await Deno.readFile(new URL('./vernex-agreement-closing-page.pdf', import.meta.url))
    const contentClientName = agreement.signed_content?.clientName || clientProfile.data?.full_name || 'Client'
    const bodyPdf = await buildAgreementPdf({
      ...agreement,
      founderName: founderProfile.data?.full_name || profile?.full_name || 'Vernex Founder',
      clientName: contentClientName,
      letterhead,
      trailingPages: 1,
    })
    const pdf = await appendClosingPage(bodyPdf, closingPage, {
      name: contentClientName,
      signature: clientSignature,
      signedAt: agreement.client_signed_at,
      timeZone: agreement.client_timezone,
      founderSignedAt: agreement.founder_signed_at,
    })
    const path = `agreements/${agreement.id}/final.pdf`
    const { error: uploadError } = await admin.storage.from('agreements').upload(path, pdf, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (uploadError) throw uploadError
    const { data: updated, error: updateError } = await admin.from('agreements').update({ signed_pdf_path: path })
      .eq('id', agreement.id).eq('status', 'signed').is('signed_pdf_path', null).select('id').maybeSingle()
    if (updateError) throw updateError
    if (updated) {
      await admin.from('agreement_events').insert({
        agreement_id: agreement.id,
        actor_user_id: authData.user.id,
        event_type: 'signed_pdf_generated',
      })
    }
    const { data: current } = await admin.from('agreements').select('signed_pdf_path').eq('id', agreement.id).single()
    return json({ path: current?.signed_pdf_path ?? path })
  } catch (error) {
    console.error('Agreement PDF generation failed', error)
    return json({ error: 'The signed PDF could not be generated.' }, 500)
  }
})
