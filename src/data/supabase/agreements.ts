import type { Agreement, AgreementEvent, AgreementTemplate } from '../../types/db'
import { DataError } from '../types'
import type { AgreementsRepo } from '../types'
import { supabase } from './client'

const BUCKET = 'agreements'
const PDF_FUNCTION = 'generate-agreement-pdf'
const SIGNATURE_LIMIT = 2 * 1024 * 1024

async function currentAuthUserId() {
  const { data, error } = await supabase().auth.getUser()
  if (error || !data.user) throw new DataError('signed_out', 'Sign in before continuing.')
  return data.user.id
}

async function addPrivateUrls(agreement: Agreement): Promise<Agreement> {
  const fields = [
    ['founder_signature_path', 'founder_signature_url'],
    ['client_signature_path', 'client_signature_url'],
    ['signed_pdf_path', 'signed_pdf_url'],
  ] as const
  const paths = fields.flatMap(([pathKey]) => agreement[pathKey] ? [agreement[pathKey] as string] : [])
  if (paths.length === 0) return agreement
  const { data } = await supabase().storage.from(BUCKET).createSignedUrls(paths, 900)
  const urls = new Map((data ?? []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []))
  const result = { ...agreement }
  for (const [pathKey, urlKey] of fields) {
    const path = agreement[pathKey]
    result[urlKey] = path ? urls.get(path) ?? null : null
  }
  return result
}

async function uploadSignature(agreementId: string, kind: 'founder' | 'client', signature: Blob) {
  if (!['image/jpeg', 'image/png'].includes(signature.type) || signature.size > SIGNATURE_LIMIT) {
    throw new DataError('invalid', 'Use a PNG or JPEG signature image under 2 MB.')
  }
  const userId = await currentAuthUserId()
  const extension = signature.type === 'image/png' ? 'png' : 'jpg'
  const path = `agreements/${agreementId}/${kind}-${userId}.${extension}`
  const { error } = await supabase().storage.from(BUCKET).upload(path, signature, {
    contentType: signature.type || 'image/png',
    upsert: true,
  })
  if (error) throw new DataError('invalid', 'Could not securely upload the signature. Please try again.')
  return path
}

async function rpcAgreement(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase().rpc(name, args)
  if (error || !data) throw new DataError('invalid', error?.message ?? 'The agreement could not be updated.')
  return data as Agreement
}

export const agreements: AgreementsRepo = {
  async list(clientId) {
    let query = supabase().from('agreements').select('*').order('updated_at', { ascending: false })
    if (clientId) query = query.eq('client_id', clientId)
    const { data, error } = await query
    if (error) throw new DataError('invalid', 'Could not load agreements.')
    return Promise.all(((data ?? []) as Agreement[]).map(addPrivateUrls))
  },

  async get(id) {
    const { data, error } = await supabase().from('agreements').select('*').eq('id', id).maybeSingle()
    if (error || !data) throw new DataError('not_found', 'Agreement not found.')
    return addPrivateUrls(data as Agreement)
  },

  async events(id) {
    const { data, error } = await supabase().from('agreement_events').select('*').eq('agreement_id', id).order('created_at')
    if (error) throw new DataError('invalid', 'Could not load the agreement history.')
    return (data ?? []) as AgreementEvent[]
  },

  async templates() {
    const { data, error } = await supabase().from('agreement_templates').select('*').eq('is_active', true).order('name')
    if (error) throw new DataError('invalid', 'Could not load agreement templates.')
    return (data ?? []) as AgreementTemplate[]
  },

  async saveTemplate(input) {
    const { data, error } = await supabase().rpc('save_agreement_template', {
      p_id: input.id ?? null,
      p_name: input.name,
      p_content: input.content,
    })
    if (error || !data) throw new DataError('invalid', error?.message ?? 'Template could not be saved.')
    return data as AgreementTemplate
  },

  async createDraft(input) {
    return rpcAgreement('create_agreement_draft', {
      p_client_id: input.client_id,
      p_template_id: input.template_id ?? null,
      p_title: input.title,
      p_content: input.content,
    })
  },

  async updateDraft(id, input) {
    return rpcAgreement('update_agreement_draft', { p_id: id, p_title: input.title, p_content: input.content })
  },

  async requestFounderSignature(id) {
    return rpcAgreement('request_agreement_founder_signature', { p_id: id })
  },

  async founderSignAndSend(id, signature) {
    const path = await uploadSignature(id, 'founder', signature)
    return rpcAgreement('founder_sign_and_send_agreement', { p_id: id, p_signature_path: path })
  },

  async clientSign(id, signature, consent, timeZone) {
    const path = await uploadSignature(id, 'client', signature)
    return rpcAgreement('client_sign_agreement', { p_id: id, p_signature_path: path, p_consent: consent, p_client_timezone: timeZone })
  },

  async cancel(id) {
    return rpcAgreement('cancel_agreement', { p_id: id })
  },

  async generateFinalPdf(id) {
    const { data, error } = await supabase().functions.invoke(PDF_FUNCTION, { body: { agreement_id: id } })
    if (error || !data?.path) throw new DataError('invalid', 'The final PDF could not be generated. You can retry from the signed agreement.')
    const { data: signed, error: linkError } = await supabase().storage.from(BUCKET).createSignedUrl(data.path, 900)
    if (linkError || !signed.signedUrl) throw new DataError('invalid', 'Could not create a secure download link for the signed PDF.')
    return signed.signedUrl
  },
}
