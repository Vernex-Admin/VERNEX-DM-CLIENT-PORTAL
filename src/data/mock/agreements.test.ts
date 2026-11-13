import { afterEach, describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { DataError } from '../types'
import { SEED_IDS } from './seed'
import { db, resetMockData, setCurrentProfileId } from './store'
import { mockAgreements } from './agreements'
import type { AgreementContent } from '../../types/agreement'

/** The words drawn on every page, joined with spaces. pdf-lib writes each as a hex string. */
async function pdfText(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes)
  const words: string[] = []
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => pdf.context.lookup(ref)) : [contents]
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) continue
      const source = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode())
      for (const [, hex] of source.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) {
        words.push(String.fromCharCode(...(hex as string).match(/../g)!.map((pair) => parseInt(pair, 16))))
      }
    }
  }
  return { pdf, text: words.join(' ') }
}

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
const content: AgreementContent = {
  projectTitle: 'Portal Refresh', agreementDate: '2026-10-21', startDate: '2026-11-01', endDate: '2027-01-31',
  clientName: 'AGK Signer', clientEmail: 'client@example.test', services: 'Website design', scope: 'Three page redesign',
  paymentTerms: 'INR 50,000 in two installments', developerName: 'AGK Signer', companyName: 'VerneX',
  companySigner: 'BOSS ANANDAA', companyTitle: 'CEO & Founder',
  clauses: [{ id: 'term-1', number: 1, title: 'Scope', body: 'Work for {{projectTitle}}; ₹8,000.' }],
}

async function createAwaitingFounder() {
  resetMockData()
  const draft = await mockAgreements.createDraft({ client_id: SEED_IDS.agk, title: 'Portal Refresh Agreement', content })
  await mockAgreements.updateDraft(draft.id, { title: draft.title, content })
  return mockAgreements.requestFounderSignature(draft.id)
}

afterEach(() => resetMockData())

describe('agreement signing workflow', () => {
  it('records founder then assigned-client signatures with server-owned timestamps, consent, and an immutable snapshot', async () => {
    const waiting = await createAwaitingFounder()
    const sent = await mockAgreements.founderSignAndSend(waiting.id, jpeg)
    expect(sent.status).toBe('awaiting_client_signature')
    expect(sent.founder_user_id).toBe(SEED_IDS.founder)
    expect(sent.founder_signed_at).toBeTruthy()
    expect(sent.sent_at).toBe(sent.founder_signed_at)
    expect(sent.signed_content).toEqual(content)

    setCurrentProfileId(SEED_IDS.agkAdmin)
    await expect(mockAgreements.clientSign(sent.id, jpeg, false, 'Asia/Kolkata')).rejects.toMatchObject({ code: 'invalid' })
    await expect(mockAgreements.clientSign(sent.id, jpeg, true, 'Invalid/Zone')).rejects.toMatchObject({ code: 'invalid' })
    const signed = await mockAgreements.clientSign(sent.id, jpeg, true, 'Asia/Kolkata')
    expect(signed.status).toBe('signed')
    expect(signed.client_user_id).toBe(SEED_IDS.agkAdmin)
    expect(signed.client_signed_at).toBeTruthy()
    expect(new Date(signed.client_signed_at as string).toISOString()).toBe(signed.client_signed_at)
    expect(signed.client_timezone).toBe('Asia/Kolkata')

    const founderEvent = db.agreement_events.find((event) => event.event_type === 'founder_signed_and_sent')
    const clientEvent = db.agreement_events.find((event) => event.event_type === 'client_signed')
    expect(founderEvent?.created_at).toBe(sent.founder_signed_at)
    expect(clientEvent?.details.signed_at).toBe(signed.client_signed_at)
    expect(clientEvent?.details.client_timezone).toBe('Asia/Kolkata')
    await expect(mockAgreements.clientSign(sent.id, jpeg, true, 'Asia/Kolkata')).rejects.toBeInstanceOf(DataError)
    await expect(mockAgreements.updateDraft(sent.id, { title: 'Changed after signing', content })).rejects.toBeInstanceOf(DataError)
    await expect(mockAgreements.cancel(sent.id)).rejects.toBeInstanceOf(DataError)
  })

  it('hides another tenant agreement and creates a signed PDF from the locked version', async () => {
    const waiting = await createAwaitingFounder()
    const sent = await mockAgreements.founderSignAndSend(waiting.id, jpeg)
    setCurrentProfileId(SEED_IDS.raackAdmin)
    await expect(mockAgreements.get(sent.id)).rejects.toMatchObject({ code: 'not_found' })

    setCurrentProfileId(SEED_IDS.agkAdmin)
    const signed = await mockAgreements.clientSign(sent.id, jpeg, true, 'Asia/Kolkata')
    const link = await mockAgreements.generateFinalPdf(signed.id)
    expect(link).toMatch(/^data:application\/pdf;base64,/)
    const bytes = Uint8Array.from(atob(link.split(',')[1] as string), (char) => char.charCodeAt(0))
    const { pdf, text } = await pdfText(bytes)
    expect(pdf.getTitle()).toBe('Portal Refresh Agreement')
    expect(text).toContain('CLIENT SERVICE AGREEMENT')
    expect(text).toContain('BOSS ANANDAA')
    expect(text).toContain('AGK Signer')
    expect(text).not.toContain('Signed (UTC):')
    expect(text).toContain('INR 8,000')
    expect(db.agreements[0]?.signed_pdf_path).toContain('final.pdf')
  })

  it('blocks non-founder from founder signing and prevents client access before sending', async () => {
    const waiting = await createAwaitingFounder()
    setCurrentProfileId(SEED_IDS.pm)
    await expect(mockAgreements.founderSignAndSend(waiting.id, jpeg)).rejects.toMatchObject({ code: 'forbidden' })
    setCurrentProfileId(SEED_IDS.agkAdmin)
    await expect(mockAgreements.get(waiting.id)).rejects.toMatchObject({ code: 'not_found' })
  })
})
