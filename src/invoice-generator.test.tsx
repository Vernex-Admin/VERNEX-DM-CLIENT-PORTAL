// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui'
import { mockData } from './data/mock'
import { SEED_IDS } from './data/mock/seed'
import { db, resetMockData } from './data/mock/store'
import { ctaFor } from './lib/actionItems'
import { BUILT_IN_DEFAULTS, newInvoiceDocument } from './lib/invoiceDocument'
import { SessionProvider } from './lib/queries'

// The PDF exporter needs a real layout engine; here it is replaced so the hand-off can be checked.
const pdfExport = vi.hoisted(() => ({
  exportInvoicePdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
  downloadFile: vi.fn(),
}))
vi.mock('./lib/invoicePdfExport', () => pdfExport)

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

function Where() {
  const location = useLocation()
  return <output data-testid="where">{location.pathname + location.search}</output>
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
            <Where />
          </MemoryRouter>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

const signInAs = (id: string) => mockData.session.switchProfile(id)
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const where = () => screen.getByTestId('where').textContent
/** The on-screen invoice (the editable sheet, or the first preview page). */
const sheet = () => within(screen.getAllByRole('article', { name: /^Invoice/ })[0] as HTMLElement)
const totalDue = () => sheet().getByLabelText('Total amount due').textContent
const panel = () => within(screen.getByRole('complementary', { name: 'Invoice settings' }))

beforeEach(() => {
  resetMockData()
  pdfExport.exportInvoicePdf.mockClear()
  pdfExport.downloadFile.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openGenerator(clientId: string = SEED_IDS.agk) {
  await signInAs(SEED_IDS.founder)
  renderAt(`/admin/invoices/new?client=${clientId}`)
  await screen.findByLabelText('Description, row 1')
}

function fillRows(rows: [string, string, string][]) {
  rows.forEach(([description, quantity, rate], index) => {
    while (!screen.queryByLabelText(`Description, row ${index + 1}`)) fireEvent.click(screen.getByRole('button', { name: 'Add row' }))
    type(`Description, row ${index + 1}`, description)
    type(`Quantity, row ${index + 1}`, quantity)
    type(`Rate, row ${index + 1}`, rate)
  })
}

/** An issued generator invoice for a client, made through the data layer. */
async function issuedInvoice(clientId: string, description = 'Website maintenance', month = '2026-10') {
  await signInAs(SEED_IDS.founder)
  const document = newInvoiceDocument(BUILT_IN_DEFAULTS)
  document.bill_to.company_name = clientId === SEED_IDS.agk ? 'AGK Fitness' : 'Raack Dance Academy'
  document.billing_month = month
  Object.assign(document.lines[0]!, { description, bill_period: 'Oct 2026', quantity: 1, rate_minor: 800_000 })
  const draft = await mockData.invoices.saveDraft({
    id: null, client_id: clientId, project_id: null, number: '', issue_date: '2026-10-01', due_date: '2026-10-15', document,
  })
  return mockData.invoices.issue(draft.id)
}

describe('Admin → Invoices', () => {
  it('lists invoices across clients with filters, and opens Create Invoice', async () => {
    const issued = await issuedInvoice(SEED_IDS.raack)
    renderAt('/admin/invoices')
    const table = within(await screen.findByRole('table', { name: 'Invoices' }))
    expect(table.getByRole('link', { name: `Open ${issued.number}` })).toBeTruthy()
    expect(table.getAllByText('AGK Fitness').length).toBeGreaterThan(0)
    expect(table.getAllByText('Raack Dance Academy').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'draft' } })
    expect(table.queryByRole('link', { name: `Open ${issued.number}` })).toBeNull()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Oct 2026' } })
    expect(table.getByRole('link', { name: `Open ${issued.number}` })).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: 'Create invoice' }))
    expect(await screen.findByLabelText('Description, row 1')).toBeTruthy()
    expect(where()).toBe('/admin/invoices/new')
  })

  it('keeps old invoice addresses working', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.raack}/invoice?title=Annual%20day%20film`)
    expect(((await screen.findByLabelText('Client or company name')) as HTMLInputElement).value).toBe('Raack Dance Academy')
    expect((screen.getByLabelText('Project or campaign name') as HTMLTextAreaElement).value).toBe('Annual day film')
    expect(where()).toBe(`/admin/invoices/new?client=${SEED_IDS.raack}&title=Annual+day+film`)
  })

  it('picks the client from a searchable list and fills Bill To from the record', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/invoices/new')
    await screen.findByRole('complementary', { name: 'Invoice settings' })
    const picker = panel().getByRole('combobox', { name: /^Client/ })
    fireEvent.focus(picker)
    fireEvent.change(picker, { target: { value: 'raa' } })
    const options = within(screen.getByRole('listbox'))
    expect(options.queryByText('AGK Fitness')).toBeNull()
    fireEvent.mouseDown(options.getByRole('option', { name: /Raack Dance Academy/ }))
    expect((screen.getByLabelText('Client or company name') as HTMLInputElement).value).toBe('Raack Dance Academy')
    expect((screen.getByLabelText('Client email') as HTMLInputElement).value).toBe('office@raackdance.example')
    // Unknown details stay blank.
    expect((screen.getByLabelText('Client phone') as HTMLInputElement).value).toBe('')
  })
})

describe('editing the invoice', () => {
  it('starts with 12 numbered blank rows and the client filled in from its record', async () => {
    await openGenerator()
    expect(screen.getByLabelText('Description, row 12')).toBeTruthy()
    expect(screen.queryByLabelText('Description, row 13')).toBeNull()
    expect((screen.getByLabelText('Client or company name') as HTMLInputElement).value).toBe('AGK Fitness')
    expect((screen.getByLabelText('Company address') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText('Client phone') as HTMLInputElement).value).toBe('')
    expect(sheet().getByText('Not applicable')).toBeTruthy()
    expect(sheet().getByRole('columnheader', { name: 'Billing Period' })).toBeTruthy()
    expect(totalDue()).toBe('0.00')
  })

  it.each([
    [2, '25,000.00'],
    [4, '50,000.00'],
    [15, '1,87,500.00'],
  ])('bills %i filled rows and ignores the unused blank ones', async (count, total) => {
    await openGenerator()
    fillRows(Array.from({ length: count }, (_, i) => [`Service ${i + 1}`, '1', '12500']))
    expect(totalDue()).toBe(total)
    expect(screen.getByLabelText(`Description, row ${Math.max(count, 12)}`)).toBeTruthy()
    expect(screen.queryByLabelText(`Description, row ${Math.max(count, 12) + 1}`)).toBeNull()
  })

  it('computes line amounts and totals as rows are typed, added, moved and deleted', async () => {
    await openGenerator()
    type('Description, row 1', 'Product shoot\nHalf day, 2 locations\n40 edited photos')
    type('Quantity, row 1', '2')
    type('Rate, row 1', '12500')
    expect(sheet().getByLabelText('Amount, row 1').textContent).toBe('25,000.00')
    type('Description, row 2', 'Reels editing')
    type('Quantity, row 2', '4')
    type('Rate, row 2', '1500.50')
    expect(sheet().getByLabelText('Amount, row 2').textContent).toBe('6,002.00')
    expect(totalDue()).toBe('31,002.00')
    expect((screen.getByLabelText('Description, row 1') as HTMLTextAreaElement).value).toContain('40 edited photos')

    fireEvent.click(screen.getByRole('button', { name: 'Add row' }))
    expect(screen.getByLabelText('Description, row 13')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete row 13' }))
    expect(screen.queryByLabelText('Description, row 13')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Move row 2 up' }))
    expect((screen.getByLabelText('Description, row 1') as HTMLTextAreaElement).value).toBe('Reels editing')
    expect(totalDue()).toBe('31,002.00')
  })

  it('flags negative, malformed and over-long entries instead of billing them', async () => {
    await openGenerator()
    type('Description, row 1', 'Shoot')
    type('Quantity, row 1', '-1')
    type('Rate, row 1', '100')
    expect(screen.getByLabelText('Quantity, row 1').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Row 1 quantity cannot be negative.')).toBeTruthy()
    type('Quantity, row 1', '1')
    type('Rate, row 1', '12.345')
    expect(screen.getByText('Row 1 rate can have at most two decimal places.')).toBeTruthy()
    type('Rate, row 1', '12')
    type('Description, row 1', Array.from({ length: 31 }, (_, i) => `Line ${i + 1}`).join('\n'))
    expect(screen.getByText(/Row 1 description is too long/)).toBeTruthy()
  })

  it('applies a discount and the GST type and rate the admin chooses', async () => {
    await openGenerator()
    fillRows([['Monthly social media management', '1', '20000']])
    fireEvent.change(panel().getByLabelText('Discount'), { target: { value: 'percent' } })
    fireEvent.change(panel().getByLabelText('Discount (%)'), { target: { value: '10' } })
    expect(totalDue()).toBe('18,000.00')

    fireEvent.change(panel().getByLabelText('GST type'), { target: { value: 'cgst_sgst' } })
    expect(totalDue()).toBe('18,000.00')
    expect(panel().getByText('Choose a GST rate.')).toBeTruthy()
    fireEvent.change(panel().getByLabelText('GST rate'), { target: { value: '18' } })
    expect(sheet().getByText('CGST 9% (₹)')).toBeTruthy()
    expect(totalDue()).toBe('21,240.00')

    fireEvent.change(panel().getByLabelText('GST type'), { target: { value: 'igst' } })
    expect(sheet().getByText('IGST 18% (₹)')).toBeTruthy()
    expect(totalDue()).toBe('21,240.00')
  })

  it('switches currency and refuses GST on a non-INR invoice', async () => {
    await openGenerator()
    fireEvent.change(panel().getByLabelText('Currency'), { target: { value: 'USD' } })
    expect(sheet().getByText('Rate ($)')).toBeTruthy()
    fireEvent.change(panel().getByLabelText('GST type'), { target: { value: 'igst' } })
    fireEvent.change(panel().getByLabelText('GST rate'), { target: { value: '18' } })
    expect(panel().getByText('GST applies only to INR invoices. Choose "No GST" for other currencies.')).toBeTruthy()
  })

  it('has Fit page, Fit width and zoom controls outside the document', async () => {
    await openGenerator()
    const zoom = within(screen.getByRole('group', { name: 'Zoom' }))
    expect(screen.getByLabelText('Zoom level').textContent).toBe('100%')
    fireEvent.click(zoom.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByLabelText('Zoom level').textContent).toBe('110%')
    fireEvent.click(zoom.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(zoom.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByLabelText('Zoom level').textContent).toBe('90%')
    fireEvent.click(zoom.getByRole('button', { name: /Fit page/ }))
    expect(zoom.getByRole('button', { name: /Fit page/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(zoom.getByRole('button', { name: /Fit width/ }))
    expect(zoom.getByRole('button', { name: /Fit width/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/A4 portrait · 1 page/)).toBeTruthy()
    expect(sheet().queryByRole('group', { name: 'Zoom' })).toBeNull()
  })
})

describe('saving, previewing, issuing and payment status', () => {
  it('saves a draft, previews it, issues it to the client, locks it, and records a manual payment', async () => {
    await openGenerator()
    fillRows([['Brand photography', '1', '15000']])
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/^Draft VX\/26-27\/\d+ saved$/)).toBeTruthy()
    const saved = db.invoices.at(-1)!
    expect(saved).toMatchObject({ client_id: SEED_IDS.agk, status: 'draft', total_minor: 1_500_000, issued_at: null })
    expect(saved.document?.lines).toHaveLength(12)
    await waitFor(() => expect(where()).toBe(`/admin/invoices/${saved.id}`))
    // The first save gives the address an id; the editor and what was typed stay on screen.
    expect((screen.getByLabelText('Description, row 1') as HTMLTextAreaElement).value).toBe('Brand photography')
    expect(totalDue()).toBe('15,000.00')
    // A draft is not sent anywhere.
    expect(db.action_items.some((item) => item.ref_id === saved.id)).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Issue Invoice & Send to Client' }))
    const review = within(await screen.findByRole('region', { name: 'Final review' }))
    expect(review.getByText(/exact A4 pages AGK Fitness will see/)).toBeTruthy()
    expect(screen.queryByLabelText('Description, row 1')).toBeNull()
    expect(screen.getByRole('article', { name: `Invoice ${saved.number}, page 1 of 1` })).toBeTruthy()
    expect(db.invoices.find((row) => row.id === saved.id)?.status).toBe('draft')
    fireEvent.click(review.getByRole('button', { name: 'Confirm: issue & send' }))
    expect(await screen.findByText(`Invoice ${saved.number} issued and sent to AGK Fitness`)).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/This version is locked/)).toBeTruthy())
    const issued = db.invoices.find((row) => row.id === saved.id)!
    expect(issued).toMatchObject({ status: 'sent', amount_paid_minor: 0 })
    expect(issued.issued_at).not.toBeNull()

    // The client's in-app notice, leading to the invoice.
    const notice = db.action_items.find((item) => item.ref_id === saved.id)!
    expect(notice).toMatchObject({ client_id: SEED_IDS.agk, type: 'invoice_due', resolved_at: null })
    expect(ctaFor(notice).to).toBe(`/billing/invoices/${saved.id}`)

    fireEvent.click(screen.getByRole('tab', { name: 'Payment' }))
    expect(screen.getByText(/does not confirm any payment/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment status' }))
    const dialog = within(await screen.findByRole('dialog', { name: /^Record payment status/ }))
    expect(dialog.getByText(/nothing has been verified automatically/)).toBeTruthy()
    fireEvent.change(dialog.getByLabelText('New status'), { target: { value: 'paid' } })
    fireEvent.change(dialog.getByLabelText(/^Note/), { target: { value: 'HDFC credit seen 21 Oct' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Record status' }))
    expect(await screen.findByText(`${saved.number} marked paid`)).toBeTruthy()
    expect(db.invoices.find((row) => row.id === saved.id)).toMatchObject({ status: 'paid', amount_paid_minor: 1_500_000 })
    expect(db.action_items.find((item) => item.ref_id === saved.id)?.resolved_at).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'History' }))
    const history = within(await screen.findByRole('list', { name: 'Invoice history' }))
    expect(history.getByText('Issued → Paid · received ₹15,000.00')).toBeTruthy()
    expect(history.getByText('“HDFC credit seen 21 Oct”')).toBeTruthy()
    expect(history.getAllByText(/IST · Boss Anandaa$/).length).toBeGreaterThan(2)
    const stamps = within(screen.getByLabelText('Timestamps'))
    expect(stamps.getByText('Issued').nextElementSibling?.textContent).toMatch(/IST · Boss Anandaa$/)
    expect(stamps.getByText('Paid').nextElementSibling?.textContent).toMatch(/IST/)
  })

  it('reopens a saved draft without duplicating rows, and saves it again', async () => {
    await openGenerator()
    fillRows([['Reels', '4', '2500'], ['Photography', '1', '12000']])
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText(/^Draft VX\/26-27\/\d+ saved$/)
    const saved = db.invoices.at(-1)!
    cleanup()

    renderAt(`/admin/invoices/${saved.id}`)
    expect(((await screen.findByLabelText('Description, row 2')) as HTMLTextAreaElement).value).toBe('Photography')
    expect(screen.queryByLabelText('Description, row 13')).toBeNull()
    type('Description, row 3', 'Graphic design')
    type('Quantity, row 3', '2')
    type('Rate, row 3', '1000')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText(`Draft ${saved.number} saved`)
    const items = db.invoice_items.filter((item) => item.invoice_id === saved.id)
    expect(items.map((item) => item.position)).toEqual([1, 2, 3])
    expect(db.invoices.filter((row) => row.number === saved.number)).toHaveLength(1)
    expect(new Set(db.invoices.find((row) => row.id === saved.id)?.document?.lines.map((line) => line.id)).size).toBe(12)
  })

  it('needs a client before saving a new invoice', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/invoices/new')
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Choose the client this invoice is for')).toBeTruthy()
    expect(db.invoices.some((row) => row.document !== null)).toBe(false)
  })

  it('duplicates as a copy or for the next month, leaving the original alone', async () => {
    const original = await issuedInvoice(SEED_IDS.agk, 'Retainer')
    renderAt(`/admin/invoices/${original.id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate for next month' }))
    expect(await screen.findByText(/created for the next month/)).toBeTruthy()
    expect(((await screen.findByLabelText('Billing period, row 1')) as HTMLInputElement).value).toBe('Nov 2026')
    const nextMonth = db.invoices.at(-1)!
    expect(nextMonth).toMatchObject({ status: 'draft', issue_date: '2026-11-01' })
    expect(db.invoices.find((row) => row.id === original.id)).toMatchObject({ status: 'sent', issue_date: '2026-10-01' })

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(await screen.findByText(/created as a copy/)).toBeTruthy()
    const copy = db.invoices.at(-1)!
    expect(copy.id).not.toBe(nextMonth.id)
    expect(copy.document?.billing_month).toBe('2026-11')
    expect(copy.document?.lines.map((line) => line.id)).not.toEqual(nextMonth.document?.lines.map((line) => line.id))
    expect(db.invoice_items.filter((item) => item.invoice_id === nextMonth.id)).toHaveLength(1)
  })
})

describe('QR code, templates, print and PDF', () => {
  it('replaces, previews and removes the QR image without touching payment status', async () => {
    await openGenerator()
    expect(sheet().getByAltText('Payment QR code').getAttribute('src')).toBe('/invoice/scan-to-pay-placeholder.png')
    fireEvent.click(screen.getByRole('tab', { name: 'Payment' }))
    fireEvent.change(screen.getByLabelText('Upload qr code'), { target: { files: [new File(['qr'], 'upi.png', { type: 'image/png' })] } })
    expect(await screen.findByText('QR code uploaded')).toBeTruthy()
    await waitFor(() => expect(sheet().getByAltText('Payment QR code').getAttribute('src')).toMatch(/^data:image\/png;base64,/))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(sheet().queryByAltText('Payment QR code')).toBeNull()
  })

  it('saves the invoice as a template and applies it to another draft', async () => {
    await openGenerator()
    fillRows([['Monthly content package', '1', '30000']])
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as template…' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Save as template' }))
    fireEvent.change(dialog.getByLabelText(/^Template name/), { target: { value: 'Content retainer' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save template' }))
    expect(await screen.findByText('Template "Content retainer" saved')).toBeTruthy()
    expect(db.invoice_templates[0]?.document.bill_to.company_name).toBe('')
    cleanup()

    renderAt(`/admin/invoices/new?client=${SEED_IDS.raack}`)
    fireEvent.click(await screen.findByRole('tab', { name: 'Templates' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply template Content retainer' }))
    expect((screen.getByLabelText('Description, row 1') as HTMLTextAreaElement).value).toBe('Monthly content package')
    expect((screen.getByLabelText('Client or company name') as HTMLInputElement).value).toBe('Raack Dance Academy')
  })

  it('prints the previewed A4 pages without editing controls or page numbers by default', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await openGenerator()
    type('Description, row 1', 'Graphic design')
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalledTimes(1)
    const copy = document.body.querySelector(':scope > .ivx-print-root') as HTMLElement
    const pages = copy.querySelectorAll('.ivx-page')
    expect(pages).toHaveLength(1)
    expect(within(copy).getByText('Graphic design')).toBeTruthy()
    expect(copy.querySelectorAll('input, textarea, button')).toHaveLength(0)
    expect(copy.querySelectorAll('tbody tr')).toHaveLength(12)
    expect(copy.querySelector('.ivx-page-number')).toBeNull()
  })

  it('downloads a PDF made from the same pages', async () => {
    await openGenerator()
    fillRows([['Video editing', '2', '5000']])
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(await screen.findByText('PDF downloaded')).toBeTruthy()
    const [pages, title] = pdfExport.exportInvoicePdf.mock.calls[0] as unknown as [HTMLElement[], string]
    expect(pages).toHaveLength(1)
    expect(pages[0]?.classList.contains('ivx-page')).toBe(true)
    expect(pages[0]?.closest('.ivx-print-root')).toBeTruthy()
    expect(title).toBe('Invoice-draft')
    expect(pdfExport.downloadFile).toHaveBeenCalledWith(expect.any(Uint8Array), 'Invoice-draft.pdf')
  })
})

describe('client billing and access', () => {
  it('keeps clients out of the admin invoice pages', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/admin/invoices/new')
    await waitFor(() => expect(where()).toBe('/'))
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
  })

  it('lists the client’s invoices under Billing → Invoices and opens the full A4 invoice', async () => {
    const mine = await issuedInvoice(SEED_IDS.agk)
    const theirs = await issuedInvoice(SEED_IDS.raack, 'Admissions campaign')
    await signInAs(SEED_IDS.agkMember)
    renderAt('/billing/invoices')
    const table = within(await screen.findByRole('table', { name: 'Invoices' }))
    expect(table.queryByText(theirs.number)).toBeNull()
    fireEvent.click(table.getByRole('link', { name: `Open invoice ${mine.number}` }))
    const page = within(await screen.findByRole('article', { name: `Invoice ${mine.number}, page 1 of 1` }))
    expect(page.getByText('Website maintenance')).toBeTruthy()
    expect(page.getByAltText('Payment QR code')).toBeTruthy()
    const summary = within(screen.getByLabelText('Invoice summary'))
    expect(summary.getByText('Oct 2026')).toBeTruthy()
    expect(summary.getAllByText('₹8,000.00', { selector: 'dd' })).toHaveLength(2)
    expect(screen.queryByLabelText('Description, row 1')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(pdfExport.downloadFile).toHaveBeenCalledWith(expect.any(Uint8Array), `Invoice-${mine.number.replace(/\//g, '-')}.pdf`))
  })

  it('never shows another client’s invoice, including through the old address', async () => {
    const theirs = await issuedInvoice(SEED_IDS.raack, 'Admissions campaign')
    await signInAs(SEED_IDS.agkAdmin)
    renderAt(`/billing/${theirs.id}`)
    await waitFor(() => expect(where()).toBe(`/billing/invoices/${theirs.id}`))
    expect(await screen.findByText(/couldn.t load this invoice/i)).toBeTruthy()
    expect(screen.queryByText('Admissions campaign')).toBeNull()
  })
})
