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
const raw = (value: Uint8Array) => new TextDecoder('latin1').decode(value)

describe('A4 agreement PDF pagination', () => {
  it('creates a single A4 body page when optional details are empty', () => {
    const pdf = raw(buildAgreementPdf(signed))
    expect(pdf).toContain('/MediaBox [0 0 595.28 841.89]')
    expect(pdf).toContain('/Count 1')
    expect(pdf).toContain('Alex Developer')
  })

  it('flows many long clauses across A4 body pages', () => {
    const longContent = {
      ...content,
      clauses: Array.from({ length: 22 }, (_, index) => ({
        id: `clause-${index + 1}`, number: index + 1, title: `Long clause ${index + 1}`,
        body: `Developer ${index + 1} delivery responsibilities, review terms, and detailed acceptance conditions. `.repeat(18),
      })),
    }
    const pdf = raw(buildAgreementPdf({
      ...signed,
      signed_content: longContent,
    }))
    const pageCount = Number(pdf.match(/\/Count (\d+)/)?.[1])
    expect(pageCount).toBeGreaterThan(2)
    expect(pdf).toContain(`Page ${pageCount} of ${pageCount}`)
    expect(pdf).toContain('Long clause 22')
  })

  it('appends the supplied vector closing page last with the client name, signature, and client-local time', async () => {
    const longContent = {
      ...content,
      clauses: Array.from({ length: 22 }, (_, index) => ({
        id: `clause-${index + 1}`, number: index + 1, title: `Long clause ${index + 1}`,
        body: `Developer ${index + 1} delivery responsibilities, review terms, and acceptance conditions. `.repeat(18),
      })),
    }
    const [body, template, clientSignature] = await Promise.all([
      Promise.resolve(buildAgreementPdf({ ...signed, signed_content: longContent })),
      readFile('public/vernex-agreement-closing-page.pdf'),
      readFile('public/vernex-founder-signature.png'),
    ])
    const finalPdf = await appendClosingPage(body, template, {
      name: 'Alex Client Representative', signature: clientSignature,
      signedAt: '2026-10-21T11:00:00.000Z', timeZone: 'Asia/Kolkata',
    })
    const generated = await PDFDocument.load(finalPdf)
    const lastPage = generated.getPage(generated.getPageCount() - 1)
    expect(generated.getPageCount()).toBeGreaterThan(2)
    expect(generated.getPageCount()).toBe(Number(raw(body).match(/\/Count (\d+)/)?.[1]) + 1)
    expect(generated.getPages().every((page) =>
      Math.abs(page.getWidth() - 595.28) < 0.01 && Math.abs(page.getHeight() - 841.89) < 0.01,
    )).toBe(true)
    expect(lastPage.getWidth()).toBeCloseTo(595.28, 2)
    expect(lastPage.getHeight()).toBeCloseTo(841.89, 2)
    expect(generated.getPages().at(-1)?.node.Contents()).toBeDefined()
  })
})
