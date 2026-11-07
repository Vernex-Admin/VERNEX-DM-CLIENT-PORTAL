import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { buildAgreementPdf } from './agreementPdf'
import { appendClosingPage } from './agreementClosingPage'
import type { AgreementContent } from '../types/agreement'

const content: AgreementContent = {
  projectTitle: 'Portal Refresh', agreementDate: '21/10/2026', startDate: '', endDate: '',
  clientName: 'Alex Developer', clientEmail: '', services: '', scope: '', paymentTerms: '',
  developerName: 'Alex Developer', companyName: 'VerneX', companySigner: 'BOSS ANANDAA',
  companyTitle: 'CEO & Founder', clauses: [],
}
const signed = {
  title: 'Portal Refresh Agreement', signed_content: content,
  founder_signed_at: '2026-10-21T10:00:00.000Z', client_signed_at: '2026-10-21T11:00:00.000Z',
  founder_user_id: 'founder-auth-id', client_user_id: 'client-auth-id',
  founderName: 'Vernex Founder', clientName: 'Alex Developer',
}
const longContent: AgreementContent = {
  ...content,
  startDate: '2026-11-01',
  paymentTerms: '₹15,000 per month, payable in advance.',
  clauses: Array.from({ length: 22 }, (_, index) => ({
    id: `clause-${index + 1}`, number: index + 1, title: `Long clause ${index + 1}`,
    body: `Developer ${index + 1} delivery responsibilities, review terms, and “detailed” acceptance conditions. `.repeat(18),
  })),
}
const isA4 = (page: { getWidth(): number; getHeight(): number }) =>
  Math.abs(page.getWidth() - 595.28) < 0.01 && Math.abs(page.getHeight() - 841.89) < 0.01

describe('A4 agreement PDF', () => {
  it('creates a single A4 body page when optional details are empty', async () => {
    const pdf = await PDFDocument.load(await buildAgreementPdf(signed))
    expect(pdf.getPageCount()).toBe(1)
    expect(isA4(pdf.getPage(0))).toBe(true)
    expect(pdf.getTitle()).toBe('Portal Refresh Agreement')
  })

  it('flows many long clauses across A4 pages on the letterhead, and handles ₹ and curly quotes', async () => {
    const letterhead = new Uint8Array(await readFile('public/templates/AGREEMENT_TEMPLATE.pdf'))
    const plain = await PDFDocument.load(await buildAgreementPdf({ ...signed, signed_content: longContent }))
    const onLetterhead = await PDFDocument.load(await buildAgreementPdf({ ...signed, signed_content: longContent, letterhead }))
    expect(plain.getPageCount()).toBeGreaterThan(2)
    // The letterhead never changes where the text breaks.
    expect(onLetterhead.getPageCount()).toBe(plain.getPageCount())
    expect(onLetterhead.getPages().every(isA4)).toBe(true)
  })

  it('embeds a custom uploaded logo and accepts a removed tagline', async () => {
    const [letterhead, logo] = await Promise.all([
      readFile('public/templates/AGREEMENT_TEMPLATE.pdf'),
      readFile('public/vernex-logo.jpg'),
    ])
    const branded = {
      ...content,
      logoUrl: `data:image/jpeg;base64,${logo.toString('base64')}`,
      tagline: '',
    }
    const pdf = await buildAgreementPdf({ ...signed, signed_content: branded, letterhead })
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1)
  })

  it('appends the fixed closing page last, untouched until the client signs', async () => {
    const [body, template, clientSignature] = await Promise.all([
      buildAgreementPdf({ ...signed, signed_content: longContent, trailingPages: 1 }),
      readFile('public/vernex-agreement-closing-page.pdf'),
      readFile('public/vernex-founder-signature.png'),
    ])
    const bodyPages = (await PDFDocument.load(body)).getPageCount()

    const unsigned = await PDFDocument.load(await appendClosingPage(body, template, { name: 'Alex Client Representative' }))
    const finalPdf = await PDFDocument.load(await appendClosingPage(body, template, {
      name: 'Alex Client Representative', signature: clientSignature,
      signedAt: '2026-10-21T11:00:00.000Z', timeZone: 'Asia/Kolkata', founderSignedAt: '2026-10-21T10:00:00.000Z',
    }))

    for (const pdf of [unsigned, finalPdf]) {
      expect(pdf.getPageCount()).toBe(bodyPages + 1)
      expect(pdf.getPages().every(isA4)).toBe(true)
    }
    // Signing adds the signature, name and dates on top of the artwork; unsigned adds nothing.
    const fontsOf = (pdf: PDFDocument) => pdf.getPages().at(-1)?.node.Resources()?.toString() ?? ''
    expect(fontsOf(unsigned)).not.toContain('Helvetica')
    expect(fontsOf(finalPdf)).toContain('/Font')
  })
})
