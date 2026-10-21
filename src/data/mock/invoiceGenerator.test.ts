import { beforeEach, describe, expect, it } from 'vitest'
import { mockData as data } from '.'
import { BUILT_IN_DEFAULTS, newInvoiceDocument } from '../../lib/invoiceDocument'
import type { InvoiceDocument, InvoiceDraftInput } from '../../types/invoiceDocument'
import { SEED_IDS } from './seed'
import { db, resetMockData } from './store'

const { agk, raack } = SEED_IDS
const signInAs = (profileId: string) => data.session.switchProfile(profileId)

function documentWith(rows: [string, number, number][], patch: Partial<InvoiceDocument> = {}): InvoiceDocument {
  const document = { ...newInvoiceDocument(BUILT_IN_DEFAULTS), ...patch }
  document.bill_to.company_name = 'AGK Fitness'
  rows.forEach(([description, quantity, rate_minor], index) => {
    const line = document.lines[index]
    if (line) Object.assign(line, { description, quantity, rate_minor })
  })
  return document
}

const draft = (document: InvoiceDocument, patch: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput => ({
  id: null,
  client_id: agk,
  project_id: null,
  number: '',
  issue_date: '2026-10-01',
  due_date: '2026-10-15',
  document,
  ...patch,
})

const retainer = () =>
  documentWith([['Monthly social media management', 1, 1_500_000], ['Reels: shooting and editing', 4, 250_000]], {
    tax: { mode: 'cgst_sgst', rate: 18 },
    billing_month: '2026-10',
  })

beforeEach(() => resetMockData())

describe('staff drafts', () => {
  beforeEach(async () => {
    await signInAs(SEED_IDS.founder)
  })

  it('saves a draft with totals computed from the page and only billed rows as items', async () => {
    const saved = await data.invoices.saveDraft(draft(retainer()))
    expect(saved).toMatchObject({
      status: 'draft',
      subtotal_minor: 2_500_000,
      taxable_minor: 2_500_000,
      tax_mode: 'cgst_sgst',
      gst_rate: 18,
      cgst_minor: 225_000,
      sgst_minor: 225_000,
      total_minor: 2_950_000,
      issued_at: null,
    })
    expect(saved.number).toMatch(/^VX\/26-27\/\d{4}$/)
    expect(saved.items.map((item) => [item.position, item.amount_minor])).toEqual([[1, 1_500_000], [2, 1_000_000]])
    expect(saved.document?.lines).toHaveLength(12)
    expect((await data.invoices.events(saved.id)).map((event) => event.event_type)).toEqual(['created'])
  })

  it('saves an empty 12-row draft and edits it later', async () => {
    const blank = newInvoiceDocument(BUILT_IN_DEFAULTS)
    const saved = await data.invoices.saveDraft(draft(blank))
    expect(saved.total_minor).toBe(0)
    const edited = await data.invoices.saveDraft(draft(retainer(), { id: saved.id }))
    expect(edited.number).toBe(saved.number)
    expect(edited.total_minor).toBe(2_950_000)
  })

  it('refuses negative values, GST on other currencies, unknown rates and oversized discounts', async () => {
    await expect(data.invoices.saveDraft(draft(documentWith([['Shoot', -1, 1000]])))).rejects.toMatchObject({
      message: 'Row 1 quantity cannot be negative.',
    })
    await expect(
      data.invoices.saveDraft(draft(documentWith([['Shoot', 1, 1000]], { currency: 'USD', tax: { mode: 'igst', rate: 18 } }))),
    ).rejects.toMatchObject({ message: 'GST applies only to INR invoices. Choose "No GST" for other currencies.' })
    await expect(data.invoices.saveDraft(draft(documentWith([['Shoot', 1, 1000]], { tax: { mode: 'igst', rate: 7 } })))).rejects.toMatchObject({
      message: '7% is not one of the configured GST rates.',
    })
    await expect(
      data.invoices.saveDraft(draft(documentWith([['Shoot', 1, 1000]], { discount: { kind: 'amount', value: 5000 } }))),
    ).rejects.toMatchObject({ message: 'The discount cannot be more than the subtotal.' })
  })

  it('supports other currencies without GST', async () => {
    const saved = await data.invoices.saveDraft(draft(documentWith([['Brand film', 1, 250_000]], { currency: 'USD' })))
    expect(saved).toMatchObject({ currency: 'USD', tax_mode: 'none', total_minor: 250_000 })
  })

  it('keeps invoice numbers unique', async () => {
    await data.invoices.saveDraft(draft(retainer(), { number: 'VX-CUSTOM-1' }))
    await expect(data.invoices.saveDraft(draft(retainer(), { number: 'VX-CUSTOM-1' }))).rejects.toMatchObject({
      message: expect.stringContaining('already used'),
    })
  })

  it('will not issue an incomplete invoice', async () => {
    const saved = await data.invoices.saveDraft(draft(newInvoiceDocument(BUILT_IN_DEFAULTS)))
    await expect(data.invoices.issue(saved.id)).rejects.toMatchObject({ message: 'Add the client or company name under Bill To.' })
  })
})

describe('issued invoices', () => {
  beforeEach(async () => {
    await signInAs(SEED_IDS.pm)
  })

  async function issued() {
    const saved = await data.invoices.saveDraft(draft(retainer()))
    return data.invoices.issue(saved.id)
  }

  it('are locked: no edits, no item changes, no deletion', async () => {
    const invoice = await issued()
    expect(invoice).toMatchObject({ status: 'sent' })
    expect(invoice.issued_at).not.toBeNull()
    await expect(data.invoices.saveDraft(draft(retainer(), { id: invoice.id }))).rejects.toMatchObject({
      message: 'Only a draft can be edited. Create a revision of an issued invoice instead.',
    })
    await expect(data.invoices.update(invoice.id, { items: [{ description: 'x', unit_price_minor: 1 }] })).rejects.toMatchObject({
      message: expect.stringContaining('cannot be changed'),
    })
    await expect(data.invoices.update(invoice.id, { due_date: '2027-01-01' })).rejects.toMatchObject({
      message: expect.stringContaining('cannot be changed'),
    })
    await expect(data.invoices.remove(invoice.id)).rejects.toMatchObject({ message: expect.stringContaining('cannot be deleted') })
    expect(db.invoices.find((row) => row.id === invoice.id)?.total_minor).toBe(2_950_000)
  })

  it('take only manual payment statuses, each recorded with its note', async () => {
    const invoice = await issued()
    await expect(data.invoices.setPaymentStatus(invoice.id, { status: 'partially_paid' })).rejects.toMatchObject({
      message: 'Enter the amount received: above zero and below the invoice total.',
    })
    const partly = await data.invoices.setPaymentStatus(invoice.id, { status: 'partially_paid', amount_paid_minor: 1_000_000, note: 'NEFT ref 1234' })
    expect(partly).toMatchObject({ status: 'partially_paid', amount_paid_minor: 1_000_000, paid_at: null })
    const paid = await data.invoices.setPaymentStatus(invoice.id, { status: 'paid' })
    expect(paid).toMatchObject({ status: 'paid', amount_paid_minor: 2_950_000 })
    expect(paid.paid_at).not.toBeNull()
    await expect(data.invoices.setPaymentStatus(invoice.id, { status: 'overdue' })).rejects.toMatchObject({
      message: 'An issued invoice cannot move from paid to overdue.',
    })

    const history = (await data.invoices.events(invoice.id)).filter((event) => event.event_type === 'status_changed')
    expect(history.map((event) => [event.details.from, event.details.to, event.details.note])).toEqual([
      ['sent', 'partially_paid', 'NEFT ref 1234'],
      ['partially_paid', 'paid', null],
    ])
    expect(history.every((event) => event.actor_user_id === SEED_IDS.pm)).toBe(true)
  })

  it('are never marked paid by issuing or by showing the QR code', async () => {
    const invoice = await issued()
    expect(invoice.document?.payment.qr).toEqual({ kind: 'default' })
    expect(invoice).toMatchObject({ status: 'sent', amount_paid_minor: 0, paid_at: null })
    expect((await data.invoiceSettings.get()).payment_mode).toBe('mock')
  })

  it('are revised by a new draft that replaces the original only once issued', async () => {
    const original = await issued()
    const revision = await data.invoices.revise(original.id)
    expect(revision).toMatchObject({ status: 'draft', revision: 2, revision_of: original.id, number: `${original.number}-R2` })
    await expect(data.invoices.revise(original.id)).rejects.toMatchObject({ message: expect.stringContaining('already exists') })
    expect(db.invoices.find((row) => row.id === original.id)).toMatchObject({ status: 'sent', superseded_by: null })

    const changed = retainer()
    changed.lines[0]!.rate_minor = 1_800_000
    await data.invoices.saveDraft(draft(changed, { id: revision.id }))
    await data.invoices.issue(revision.id)
    expect(db.invoices.find((row) => row.id === original.id)).toMatchObject({ status: 'void', superseded_by: revision.id, total_minor: 2_950_000 })
    expect(db.invoices.find((row) => row.id === revision.id)).toMatchObject({ status: 'sent', total_minor: 3_304_000 })
  })

  it('cannot be revised once paid', async () => {
    const invoice = await issued()
    await data.invoices.setPaymentStatus(invoice.id, { status: 'paid' })
    await expect(data.invoices.revise(invoice.id)).rejects.toMatchObject({ message: 'Paid, part-paid or cancelled invoices cannot be revised.' })
  })

  it('copy to the next month as a new draft without touching the original', async () => {
    const invoice = await issued()
    const copy = await data.invoices.duplicate(invoice.id, 'next_month')
    expect(copy.id).not.toBe(invoice.id)
    expect(copy.number).not.toBe(invoice.number)
    expect(copy).toMatchObject({ status: 'draft', issue_date: '2026-11-01', due_date: '2026-11-15', total_minor: 2_950_000 })
    expect(copy.document?.billing_month).toBe('2026-11')
    expect(db.invoices.find((row) => row.id === invoice.id)).toMatchObject({ status: 'sent', issue_date: '2026-10-01' })
    expect((await data.invoices.events(copy.id))[0]?.details).toEqual({ copied_from: invoice.id })
  })
})

describe('clients', () => {
  async function issuedFor(clientId: string, qrPath?: string) {
    await signInAs(SEED_IDS.founder)
    const document = retainer()
    if (qrPath) document.payment.qr = { kind: 'uploaded', path: qrPath }
    const saved = await data.invoices.saveDraft(draft(document, { client_id: clientId }))
    return data.invoices.issue(saved.id)
  }

  it('see their own issued invoices only, never drafts or other clients', async () => {
    const mine = await issuedFor(agk)
    const theirs = await issuedFor(raack)
    const pending = await data.invoices.saveDraft(draft(retainer()))
    await signInAs(SEED_IDS.agkAdmin)
    expect((await data.invoices.get(mine.id)).document?.lines).toHaveLength(12)
    await expect(data.invoices.get(theirs.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(data.invoices.get(pending.id)).rejects.toMatchObject({ code: 'not_found' })
    expect((await data.invoices.list()).every((row) => row.client_id === agk && row.status !== 'draft')).toBe(true)
  })

  it('cannot create, issue, revise, set status, read history, settings or templates', async () => {
    const mine = await issuedFor(agk)
    await signInAs(SEED_IDS.agkAdmin)
    const forbidden = { code: 'forbidden' }
    await expect(data.invoices.saveDraft(draft(retainer()))).rejects.toMatchObject(forbidden)
    await expect(data.invoices.issue(mine.id)).rejects.toMatchObject(forbidden)
    await expect(data.invoices.revise(mine.id)).rejects.toMatchObject(forbidden)
    await expect(data.invoices.setPaymentStatus(mine.id, { status: 'paid' })).rejects.toMatchObject(forbidden)
    await expect(data.invoices.duplicate(mine.id, 'next_month')).rejects.toMatchObject(forbidden)
    await expect(data.invoices.events(mine.id)).rejects.toMatchObject(forbidden)
    await expect(data.invoiceSettings.get()).rejects.toMatchObject(forbidden)
    await expect(data.invoiceSettings.save({ defaults: BUILT_IN_DEFAULTS, payment_mode: 'mock' })).rejects.toMatchObject(forbidden)
    await expect(data.invoiceSettings.templates()).rejects.toMatchObject(forbidden)
    await expect(data.invoiceSettings.uploadImage('qr', new File(['x'], 'qr.png', { type: 'image/png' }))).rejects.toMatchObject(forbidden)
  })

  it('get image links only for images on their own issued invoices', async () => {
    await signInAs(SEED_IDS.founder)
    const ownQr = await data.invoiceSettings.uploadImage('qr', new File(['a'], 'a.png', { type: 'image/png' }))
    const otherQr = await data.invoiceSettings.uploadImage('qr', new File(['b'], 'b.png', { type: 'image/png' }))
    await issuedFor(agk, ownQr)
    await issuedFor(raack, otherQr)
    await signInAs(SEED_IDS.agkMember)
    const urls = await data.invoiceSettings.imageUrls([ownQr, otherQr])
    expect(Object.keys(urls)).toEqual([ownQr])
  })
})

describe('settings, images and templates', () => {
  beforeEach(async () => {
    await signInAs(SEED_IDS.pm)
  })

  it('keeps Mock Payment until a gateway is configured on the server', async () => {
    const settings = await data.invoiceSettings.get()
    expect(settings).toMatchObject({ payment_mode: 'mock', gateway_configured: false })
    await expect(data.invoiceSettings.save({ defaults: settings.defaults, payment_mode: 'gateway' })).rejects.toMatchObject({
      message: expect.stringContaining('Gateway Integration is not configured'),
    })
  })

  it('saves defaults and validates the default tax', async () => {
    const { defaults } = await data.invoiceSettings.get()
    const saved = await data.invoiceSettings.save({
      defaults: { ...defaults, gst_rates: [18], tax: { mode: 'cgst_sgst', rate: 18 }, company: { ...defaults.company, address: 'Anna Nagar, Chennai' } },
      payment_mode: 'mock',
    })
    expect(saved.defaults.company.address).toBe('Anna Nagar, Chennai')
    await expect(
      data.invoiceSettings.save({ defaults: { ...defaults, gst_rates: [18], tax: { mode: 'igst', rate: 5 } }, payment_mode: 'mock' }),
    ).rejects.toMatchObject({ message: 'The default GST rate must be one of the configured rates, or 0 for no GST.' })
  })

  it('replaces a QR image without losing the one an issued invoice shows', async () => {
    await expect(data.invoiceSettings.uploadImage('qr', new File(['x'], 'qr.gif', { type: 'image/gif' }))).rejects.toMatchObject({
      message: 'Use a PNG, JPEG or WebP image.',
    })
    const first = await data.invoiceSettings.uploadImage('qr', new File(['1'], 'one.png', { type: 'image/png' }))
    const second = await data.invoiceSettings.uploadImage('qr', new File(['2'], 'two.png', { type: 'image/png' }))
    expect(first).toMatch(/^branding\/qr-[0-9a-f-]{36}\.png$/)
    expect(Object.keys(await data.invoiceSettings.imageUrls([first, second])).sort()).toEqual([first, second].sort())
  })

  it('saves, lists and deletes templates', async () => {
    const template = await data.invoiceSettings.saveTemplate({ name: 'Monthly retainer', document: retainer() })
    expect((await data.invoiceSettings.templates()).map((row) => row.name)).toEqual(['Monthly retainer'])
    await data.invoiceSettings.removeTemplate(template.id)
    expect(await data.invoiceSettings.templates()).toEqual([])
  })
})

describe('issuing, copying and the audit trail', () => {
  beforeEach(async () => {
    await signInAs(SEED_IDS.founder)
  })

  it('notifies only the invoice’s client when it is issued, and clears the notice once paid', async () => {
    const saved = await data.invoices.saveDraft(draft(retainer()))
    expect(db.action_items.some((item) => item.ref_id === saved.id)).toBe(false)
    const issued = await data.invoices.issue(saved.id)

    await signInAs(SEED_IDS.agkMember)
    const notices = (await data.actionItems.list({ open: true })).filter((item) => item.ref_id === saved.id)
    expect(notices).toMatchObject([{ type: 'invoice_due', title: `Invoice ${issued.number} is due on 15 Oct 2026` }])
    await signInAs(SEED_IDS.raackAdmin)
    expect((await data.actionItems.list()).some((item) => item.ref_id === saved.id)).toBe(false)

    await signInAs(SEED_IDS.pm)
    await data.invoices.setPaymentStatus(saved.id, { status: 'paid' })
    expect(db.action_items.find((item) => item.ref_id === saved.id)?.resolved_at).not.toBeNull()
  })

  it('records who did what, with server-side timestamps', async () => {
    const saved = await data.invoices.saveDraft(draft(retainer()))
    await signInAs(SEED_IDS.pm)
    await data.invoices.issue(saved.id)
    const events = await data.invoices.events(saved.id)
    expect(events.map((event) => [event.event_type, event.actor_name])).toEqual([
      ['created', 'Boss Anandaa'],
      ['issued', 'Karthik Raj'],
    ])
    expect(events.every((event) => !Number.isNaN(Date.parse(event.created_at)))).toBe(true)
    const invoice = db.invoices.find((row) => row.id === saved.id)!
    expect(Date.parse(invoice.issued_at!)).toBeGreaterThanOrEqual(Date.parse(invoice.created_at))
  })

  it('copies an invoice for the same period with new rows and a new number', async () => {
    const saved = await data.invoices.saveDraft(draft(retainer()))
    const copy = await data.invoices.duplicate(saved.id, 'copy')
    expect(copy.number).not.toBe(saved.number)
    expect(copy.document?.billing_month).toBe('2026-10')
    expect(copy.total_minor).toBe(saved.total_minor)
    expect(copy.document?.lines.map((line) => line.id)).not.toEqual(saved.document?.lines.map((line) => line.id))
    // The due date keeps its 14-day gap from today's invoice date.
    expect(Date.parse(copy.due_date) - Date.parse(copy.issue_date)).toBe(14 * 86_400_000)
    expect(db.invoice_items.filter((item) => item.invoice_id === saved.id)).toHaveLength(2)
    expect(db.invoice_items.filter((item) => item.invoice_id === copy.id)).toHaveLength(2)
  })

  it('refuses duplicated rows and descriptions too long for one A4 page', async () => {
    const duplicated = retainer()
    duplicated.lines[1] = { ...duplicated.lines[1]!, id: duplicated.lines[0]!.id }
    await expect(data.invoices.saveDraft(draft(duplicated))).rejects.toMatchObject({ message: expect.stringContaining('duplicate of another row') })
    const long = documentWith([['x'.repeat(1501), 1, 100]])
    await expect(data.invoices.saveDraft(draft(long))).rejects.toMatchObject({ message: expect.stringContaining('description is too long') })
  })

  it('saving the same draft again never duplicates its items', async () => {
    const saved = await data.invoices.saveDraft(draft(retainer()))
    await data.invoices.saveDraft(draft(saved.document!, { id: saved.id }))
    await data.invoices.saveDraft(draft(saved.document!, { id: saved.id }))
    expect(db.invoice_items.filter((item) => item.invoice_id === saved.id).map((item) => item.position)).toEqual([1, 2])
  })

  it('refuses staff who are not assigned to the client', async () => {
    const other = await data.clients.create({ name: 'Unassigned Co', slug: 'unassigned-co' })
    await signInAs(SEED_IDS.pm)
    await expect(data.invoices.saveDraft(draft(retainer(), { client_id: other.id }))).rejects.toMatchObject({ code: 'forbidden' })
  })
})
