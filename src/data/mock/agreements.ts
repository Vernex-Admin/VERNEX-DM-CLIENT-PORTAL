import type { Agreement, AgreementEvent, AgreementTemplate } from '../../types/db'
import { buildAgreementPdf } from '../../lib/agreementPdf'
import { DataError } from '../types'
import type { AgreementsRepo } from '../types'
import { currentProfile, db, guard, newId, nowIso, run, visibleClientIds } from './store'

function dataUrl(bytes: Uint8Array, mime: string) {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

async function blobDataUrl(blob: Blob) {
  return dataUrl(new Uint8Array(await blob.arrayBuffer()), blob.type || 'image/jpeg')
}

function bytesFromDataUrl(value: string | null | undefined) {
  if (!value?.startsWith('data:')) return undefined
  const encoded = value.split(',')[1]
  if (!encoded) return undefined
  const binary = atob(encoded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function emit(id: string, event_type: AgreementEvent['event_type'], details: Record<string, unknown> = {}, createdAt?: string) {
  const profile = currentProfile()
  if (!profile) throw new DataError('signed_out', 'You are signed out.')
  db.agreement_events.push({
    id: newId(), agreement_id: id, actor_user_id: profile.id, event_type, details, created_at: createdAt ?? nowIso(),
  })
}

function readAgreement(id: string) {
  const agreement = db.agreements.find((row) => row.id === id)
  const profile = currentProfile()
  if (!agreement || !profile || !visibleClientIds(profile).has(agreement.client_id)) {
    throw new DataError('not_found', 'Agreement not found.')
  }
  const isClient = profile.role === 'client_admin' || profile.role === 'client_member'
  if (isClient && (!agreement.sent_at || !['awaiting_client_signature', 'signed', 'cancelled'].includes(agreement.status))) {
    throw new DataError('not_found', 'Agreement not found.')
  }
  return agreement
}

export const mockAgreements: AgreementsRepo = {
  list(clientId) {
    return run(() => {
      const profile = currentProfile()
      if (!profile) throw new DataError('signed_out', 'You are signed out.')
      const ids = visibleClientIds(profile)
      const isClient = profile.role === 'client_admin' || profile.role === 'client_member'
      return db.agreements.filter((agreement) => ids.has(agreement.client_id)
        && (!clientId || agreement.client_id === clientId)
        && (!isClient || (agreement.sent_at !== null && ['awaiting_client_signature', 'signed', 'cancelled'].includes(agreement.status))))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    })
  },
  get(id) { return run(() => readAgreement(id)) },
  events(id) {
    return run(() => {
      readAgreement(id)
      return db.agreement_events.filter((event) => event.agreement_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  },
  templates() {
    return run(() => {
      guard('template', 'view')
      return db.agreement_templates.filter((template) => template.is_active).sort((a, b) => a.name.localeCompare(b.name))
    })
  },
  saveTemplate(input) {
    return run(() => {
      const profile = guard('template', input.id ? 'edit' : 'create')
      const name = input.name.trim()
      if (!name) throw new DataError('invalid', 'Give the template a name.')
      const existing = input.id ? db.agreement_templates.find((template) => template.id === input.id) : null
      if (input.id && !existing) throw new DataError('not_found', 'Template not found.')
      if (existing) Object.assign(existing, { name, content: structuredClone(input.content), updated_at: nowIso() })
      else {
        const template: AgreementTemplate = {
          id: newId(), name, content: structuredClone(input.content), is_active: true,
          created_by: profile.id, created_at: nowIso(), updated_at: nowIso(),
        }
        db.agreement_templates.push(template)
        return template
      }
      return existing as AgreementTemplate
    })
  },
  createDraft(input) {
    return run(() => {
      guard('document', 'create', input.client_id)
      const profile = currentProfile()
      if (!profile || !input.title.trim()) throw new DataError('invalid', 'Choose a client and enter an agreement title.')
      if (input.template_id && !db.agreement_templates.some((t) => t.id === input.template_id && t.is_active)) {
        throw new DataError('not_found', 'Template not found.')
      }
      const now = nowIso()
      const agreement: Agreement = {
        id: newId(), client_id: input.client_id, template_id: input.template_id ?? null,
        title: input.title.trim(), content: structuredClone(input.content), status: 'draft', created_by: profile.id,
        founder_user_id: null, founder_signature_path: null, founder_signed_at: null, sent_at: null,
        client_user_id: null, client_signature_path: null, client_signed_at: null, client_timezone: null, signed_content: null,
        signed_pdf_path: null, cancelled_by: null, cancelled_at: null, created_at: now, updated_at: now,
        version: 1,
      }
      db.agreements.push(agreement)
      emit(agreement.id, 'created')
      return agreement
    })
  },
  updateDraft(id, input) {
    return run(() => {
      const agreement = readAgreement(id)
      guard('document', 'edit', agreement.client_id)
      if (agreement.status !== 'draft') throw new DataError('forbidden', 'Only a draft agreement can be edited.')
      agreement.title = input.title.trim()
      agreement.content = structuredClone(input.content)
      agreement.version += 1
      agreement.updated_at = nowIso()
      emit(id, 'edited', { version: agreement.version })
      return agreement
    })
  },
  requestFounderSignature(id) {
    return run(() => {
      const agreement = readAgreement(id)
      guard('document', 'edit', agreement.client_id)
      if (agreement.status !== 'draft') throw new DataError('forbidden', 'Only a draft can be submitted for signature.')
      agreement.status = 'awaiting_founder_signature'
      agreement.updated_at = nowIso()
      emit(id, 'submitted_for_founder_signature')
      return agreement
    })
  },
  async founderSignAndSend(id, signature) {
    const image = await blobDataUrl(signature)
    return run(() => {
      const agreement = readAgreement(id)
      const profile = currentProfile()
      if (profile?.role !== 'vernex_founder') throw new DataError('forbidden', 'Only the founder can sign and send agreements.')
      if (agreement.status !== 'awaiting_founder_signature') throw new DataError('forbidden', 'Agreement is not awaiting founder signature.')
      const now = nowIso()
      agreement.status = 'awaiting_client_signature'
      agreement.founder_user_id = profile.id
      agreement.founder_signature_path = `mock://${id}/founder-${profile.id}.jpg`
      agreement.founder_signature_url = image
      agreement.founder_signed_at = now
      agreement.sent_at = now
      agreement.signed_content = structuredClone(agreement.content)
      agreement.updated_at = now
      emit(id, 'founder_signed_and_sent', { sent_at: now }, now)
      return agreement
    })
  },
  async clientSign(id, signature, consent, timeZone) {
    const image = await blobDataUrl(signature)
    return run(() => {
      if (!consent) throw new DataError('invalid', 'Please confirm that you agree before signing.')
      try { new Intl.DateTimeFormat('en', { timeZone }) } catch { throw new DataError('invalid', 'A valid client timezone is required.') }
      const agreement = readAgreement(id)
      const profile = currentProfile()
      if (!profile || (profile.role !== 'client_admin' && profile.role !== 'client_member') || profile.client_id !== agreement.client_id) {
        throw new DataError('forbidden', 'Only the assigned client can sign this agreement.')
      }
      if (agreement.status !== 'awaiting_client_signature') throw new DataError('forbidden', 'This agreement is not awaiting your signature.')
      const now = nowIso()
      agreement.status = 'signed'
      agreement.client_user_id = profile.id
      agreement.client_signature_path = `mock://${id}/client-${profile.id}.jpg`
      agreement.client_signature_url = image
      agreement.client_signed_at = now
      agreement.client_timezone = timeZone
      agreement.updated_at = now
      emit(id, 'client_signed', { consent: true, signed_at: now, client_timezone: timeZone }, now)
      return agreement
    })
  },
  cancel(id) {
    return run(() => {
      const agreement = readAgreement(id)
      guard('document', 'edit', agreement.client_id)
      if (!['draft', 'awaiting_founder_signature', 'awaiting_client_signature'].includes(agreement.status)) {
        throw new DataError('forbidden', 'This agreement cannot be cancelled.')
      }
      const profile = currentProfile()
      if (!profile) throw new DataError('signed_out', 'You are signed out.')
      const now = nowIso()
      agreement.status = 'cancelled'
      agreement.cancelled_by = profile.id
      agreement.cancelled_at = now
      agreement.updated_at = now
      emit(id, 'cancelled')
      return agreement
    })
  },
  async generateFinalPdf(id) {
    const { bytes, clientName, clientSignature, clientSignedAt, clientTimeZone } = await run(() => {
      const agreement = readAgreement(id)
      if (agreement.status !== 'signed' || !agreement.signed_content) throw new DataError('forbidden', 'Only a signed agreement can be downloaded.')
      const founder = db.profiles.find((profile) => profile.id === agreement.founder_user_id)
      const clientUser = db.profiles.find((profile) => profile.id === agreement.client_user_id)
      const bytes = buildAgreementPdf({
        ...agreement,
        founderName: founder?.full_name ?? 'Vernex Founder',
        clientName: clientUser?.full_name ?? agreement.signed_content.clientName,
      })
      return {
        bytes,
        clientName: agreement.signed_content.clientName || clientUser?.full_name || 'Client',
        clientSignature: bytesFromDataUrl(agreement.client_signature_url),
        clientSignedAt: agreement.client_signed_at,
        clientTimeZone: agreement.client_timezone,
      }
    })
    let finalBytes = bytes
    if (typeof window !== 'undefined') {
      const response = await fetch('/vernex-agreement-closing-page.pdf')
      if (!response.ok) throw new DataError('invalid', 'The shared agreement closing page could not be loaded.')
      const { appendClosingPage } = await import('../../lib/agreementClosingPage')
      if (!clientSignedAt || !clientTimeZone) throw new DataError('invalid', 'The client signing time is missing.')
      finalBytes = await appendClosingPage(bytes, new Uint8Array(await response.arrayBuffer()), {
        name: clientName,
        signature: clientSignature,
        signedAt: clientSignedAt,
        timeZone: clientTimeZone,
      })
    }
    const link = dataUrl(finalBytes, 'application/pdf')
    return run(() => {
      const agreement = readAgreement(id)
      if (!agreement.signed_pdf_path) {
        agreement.signed_pdf_path = `mock://${id}/final.pdf`
        emit(id, 'signed_pdf_generated')
      }
      agreement.signed_pdf_url = link
      return link
    })
  },
}
