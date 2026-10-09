// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui'
import { mockData } from './data/mock'
import { SEED_IDS } from './data/mock/seed'
import { db, resetMockData } from './data/mock/store'
import { SessionProvider } from './lib/queries'

// Pages are code-split, so the first visit to one waits for its chunk to load.
configure({ asyncUtilTimeout: 10_000 })

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

const signInAs = (id: string) => mockData.session.switchProfile(id)
const drawer = async () => within(await screen.findByRole('dialog'))
const column = (name: string) => within(screen.getByRole('listitem', { name: new RegExp(`^${name},`) }))

beforeEach(() => resetMockData())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('pipeline', () => {
  it('shows the eleven stages with lead cards', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/pipeline')
    await screen.findByText('GT Auto Works')
    const names = ['New Lead', 'Researched', 'Qualified', 'Outreach Sent', 'Responded', 'Discovery Call', 'Qualified Opportunity', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']
    for (const name of names) expect(column(name).getByRole('heading', { name: new RegExp(`^${name}`) })).toBeTruthy()
    expect(screen.getAllByRole('listitem', { name: /leads?$/ })).toHaveLength(11)

    // Company, city, score, tier, next action, follow-up date.
    const qualified = column('Qualified')
    expect(qualified.getByText('Sri Lakshmi Sweets')).toBeTruthy()
    expect(qualified.getByText('Chennai')).toBeTruthy()
    expect(qualified.getByText('Score 78')).toBeTruthy()
    expect(qualified.getByText('Tier A')).toBeTruthy()
    expect(qualified.getByText('Send the intro on WhatsApp')).toBeTruthy()
    // Two days late: flagged in words as well as colour.
    expect(qualified.getByText(/^Overdue:/).className).toContain('text-bad')
    // On time, so not flagged.
    expect(column('New Lead').queryByText(/^Overdue:/)).toBeNull()
    // Every card has a handle for keyboard and pointer dragging.
    expect(screen.getByRole('button', { name: 'Move Sri Lakshmi Sweets' })).toBeTruthy()
  })

  it('moves a lead between stages from its drawer and logs it', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/pipeline')
    fireEvent.click(await screen.findByRole('button', { name: 'Kavya Silks' }))
    const form = await drawer()
    fireEvent.change(form.getByLabelText('Stage'), { target: { value: 'responded' } })
    fireEvent.click(form.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Kavya Silks saved')).toBeTruthy()
    await waitFor(() => expect(column('Responded').getByText('Kavya Silks')).toBeTruthy())
    const log = db.lead_activity.filter((row) => row.lead_id === 'l-4').map((row) => row.text)
    expect(log).toContain('Moved from Outreach Sent to Responded')
  })

  it('has every lead field and an activity log in the drawer', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/pipeline')
    fireEvent.click(await screen.findByRole('button', { name: 'Sri Lakshmi Sweets' }))
    const form = await drawer()
    for (const label of [
      'Company', 'Country', 'City', 'Industry', 'Website', 'Instagram', 'LinkedIn', 'Decision Maker', 'Role', 'Email', 'Phone',
      'Score', 'Tier', 'Problem', 'Opportunity', 'Recommended Offer', 'Estimated Monthly Budget (₹)', 'Next Action', 'Follow-up Date', 'Notes',
    ]) {
      expect(form.getByLabelText(new RegExp(`^${label.replace(/[()₹]/g, '.')}`)), label).toBeTruthy()
    }
    expect((form.getByLabelText(/^Estimated Monthly/) as HTMLInputElement).value).toBe('25000')
    expect(await form.findByText('Lead added')).toBeTruthy()
    // Not Closed Won, so no convert button.
    expect(form.queryByRole('button', { name: 'Convert to client' })).toBeNull()
  })

  it('adds a lead and rejects bad values', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/pipeline')
    fireEvent.click(await screen.findByRole('button', { name: 'New lead' }))
    const form = await drawer()
    fireEvent.click(form.getByRole('button', { name: 'Add lead' }))
    expect(await form.findByText('Enter the company name.')).toBeTruthy()
    fireEvent.change(form.getByLabelText(/^Company/), { target: { value: 'Fresh Foods' } })
    fireEvent.change(form.getByLabelText(/^Score/), { target: { value: '150' } })
    fireEvent.click(form.getByRole('button', { name: 'Add lead' }))
    expect(await form.findByText('Enter a whole number from 0 to 100.')).toBeTruthy()
    fireEvent.change(form.getByLabelText(/^Score/), { target: { value: '72' } })
    fireEvent.change(form.getByLabelText(/^Phone/), { target: { value: '98765 43210' } })
    fireEvent.click(form.getByRole('button', { name: 'Add lead' }))
    expect(await screen.findByText('Fresh Foods added')).toBeTruthy()
    expect(db.leads.find((row) => row.company === 'Fresh Foods')).toMatchObject({ stage: 'new_lead', score: 72, phone_e164: '+919876543210' })
  })

  it('converts a Closed Won lead to a client, once', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/pipeline')
    fireEvent.click(await screen.findByRole('button', { name: 'Orbit Tuition Centre' }))
    const form = await drawer()
    fireEvent.click(form.getByRole('button', { name: 'Convert to client' }))
    expect(await screen.findByRole('heading', { name: 'Orbit Tuition Centre' })).toBeTruthy()
    const client = db.clients.find((row) => row.name === 'Orbit Tuition Centre')!
    expect(client).toMatchObject({ industry: 'Education', billing_email: 'hello@orbittuition.example' })
    expect(db.leads.find((row) => row.id === 'l-8')?.converted_client_id).toBe(client.id)
    await expect(mockData.leads.convertToClient('l-8')).rejects.toMatchObject({ code: 'invalid' })
    await expect(mockData.leads.convertToClient('l-7')).rejects.toMatchObject({ code: 'invalid' })
  })

  it('imports a CSV with a column mapping', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/pipeline')
    fireEvent.click(await screen.findByRole('button', { name: 'Import CSV' }))
    const form = await drawer()
    const csv = 'Business,Town,Contact,Budget\n"Cafe Aroma, Adyar",Chennai,Divya,"12,000"\nSpice Route,Madurai,Ravi,8000\n,Nowhere,Nobody,1'
    fireEvent.change(form.getByLabelText('Or paste CSV text'), { target: { value: csv } })
    // "Business" and "Budget" are recognised; "Town" is not, so it is mapped by hand.
    expect((form.getByLabelText('Field for Business') as HTMLSelectElement).value).toBe('company')
    expect((form.getByLabelText('Field for Town') as HTMLSelectElement).value).toBe('')
    fireEvent.change(form.getByLabelText('Field for Town'), { target: { value: 'city' } })
    expect(form.getByText(/3 rows found, 1 without a company will be skipped/)).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Import 2 leads' }))
    expect(await screen.findByText('2 leads imported')).toBeTruthy()
    expect(db.leads.find((row) => row.company === 'Cafe Aroma, Adyar')).toMatchObject({
      city: 'Chennai', decision_maker: 'Divya', monthly_budget_minor: 1_200_000, stage: 'new_lead',
    })
    expect(await screen.findByText('Spice Route')).toBeTruthy()
  })

  it('refuses a CSV with no Company column mapped', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/pipeline')
    fireEvent.click(await screen.findByRole('button', { name: 'Import CSV' }))
    const form = await drawer()
    fireEvent.change(form.getByLabelText('Or paste CSV text'), { target: { value: 'Town,Contact\nChennai,Divya' } })
    fireEvent.click(form.getByRole('button', { name: /^Import/ }))
    expect(await form.findByText('Map one column to Company.')).toBeTruthy()
  })

  it('shows an empty state and an error state', async () => {
    await signInAs(SEED_IDS.pm)
    vi.spyOn(mockData.leads, 'list').mockResolvedValue([])
    renderAt('/admin/pipeline')
    expect(await screen.findByText('Your pipeline is empty')).toBeTruthy()
    cleanup()
    vi.spyOn(mockData.leads, 'list').mockRejectedValue(new Error('down'))
    renderAt('/admin/pipeline')
    expect(await screen.findByText("We couldn't load the pipeline")).toBeTruthy()
  })

  it('rolls a failed stage change back', async () => {
    await signInAs(SEED_IDS.pm)
    vi.spyOn(mockData.leads, 'update').mockRejectedValue(new Error('Server said no'))
    renderAt('/admin/pipeline')
    fireEvent.click(await screen.findByRole('button', { name: 'Kavya Silks' }))
    const form = await drawer()
    fireEvent.change(form.getByLabelText('Stage'), { target: { value: 'proposal' } })
    fireEvent.click(form.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Could not save the lead')).toBeTruthy()
    await waitFor(() => expect(column('Outreach Sent').getByText('Kavya Silks')).toBeTruthy())
  })
})

describe('outbox', () => {
  it('lists reminders with status and opens a prefilled wa.me link, marking it sent', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/outbox')
    const link = (await screen.findByRole('link', { name: /Send on WhatsApp to Arun Kumar: Invoice VX\/26-27\/0044 is overdue/ })) as HTMLAnchorElement
    expect(link.href.startsWith('https://wa.me/919000000002?text=')).toBe(true)
    expect(decodeURIComponent(link.href.split('text=')[1] as string)).toContain('invoice VX/26-27/0044')
    expect(link.target).toBe('_blank')
    expect(screen.getAllByText('Queued').length).toBe(4)
    expect(screen.getAllByText('Sent').length).toBe(1)

    fireEvent.click(link)
    await waitFor(() => expect(db.reminders.find((row) => row.id === 'rm-1')?.status).toBe('sent'))
    expect(screen.getAllByText('Queued').length).toBe(3)
  })

  it('skips a reminder, and shows empty and error states', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/outbox')
    fireEvent.click(await screen.findByRole('button', { name: 'Skip Rehearsal footage still missing' }))
    await waitFor(() => expect(db.reminders.find((row) => row.id === 'rm-3')?.status).toBe('skipped'))
    cleanup()
    vi.spyOn(mockData.reminders, 'list').mockResolvedValue([])
    renderAt('/admin/outbox')
    expect(await screen.findByText('The outbox is empty')).toBeTruthy()
    cleanup()
    vi.spyOn(mockData.reminders, 'list').mockRejectedValue(new Error('down'))
    renderAt('/admin/outbox')
    expect(await screen.findByText("We couldn't load the outbox")).toBeTruthy()
  })
})

describe('founder inbox', () => {
  it('shows the no-access page to a PM', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/founder-inbox')
    expect(await screen.findByText("You don't have access")).toBeTruthy()
    expect(screen.queryByText('Worried about the annual day timeline')).toBeNull()
    await expect(mockData.founderBox.listInbox()).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('lets the founder read, reply and change status', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/founder-inbox')
    // Newest first: Raack's concern is selected.
    const article = await screen.findByRole('article', { name: 'Worried about the annual day timeline' })
    const inside = within(article)
    expect((inside.getByLabelText('Status') as HTMLSelectElement).value).toBe('new')
    expect(inside.getByText(/The film has not started/)).toBeTruthy()

    fireEvent.click(inside.getByRole('button', { name: 'Send reply' }))
    expect(await inside.findByText('Write a reply first.')).toBeTruthy()
    fireEvent.change(inside.getByLabelText('Reply'), { target: { value: 'Let us talk Thursday. I will call you.' } })
    fireEvent.click(inside.getByRole('button', { name: 'Send reply' }))
    expect(await screen.findByText('Reply sent')).toBeTruthy()
    expect(await inside.findByText('Let us talk Thursday. I will call you.')).toBeTruthy()
    expect(db.feedback.find((row) => row.id === 'fb-raack-1')).toMatchObject({ status: 'acknowledged', reply: 'Let us talk Thursday. I will call you.' })

    fireEvent.change(inside.getByLabelText('Status'), { target: { value: 'resolved' } })
    await waitFor(() => expect(db.feedback.find((row) => row.id === 'fb-raack-1')?.status).toBe('resolved'))
  })

  it('shows the founder’s reply back to the client', async () => {
    await signInAs(SEED_IDS.raackAdmin)
    await signInAs(SEED_IDS.founder)
    await mockData.founderBox.reply('fb-raack-1', 'Calling you tomorrow.')
    await signInAs(SEED_IDS.raackAdmin)
    renderAt('/founder-box')
    expect(await screen.findByText('Calling you tomorrow.')).toBeTruthy()
  })

  it('shows empty and error states', async () => {
    await signInAs(SEED_IDS.founder)
    vi.spyOn(mockData.founderBox, 'listInbox').mockResolvedValue([])
    renderAt('/admin/founder-inbox')
    expect(await screen.findByText('No messages yet')).toBeTruthy()
    cleanup()
    vi.spyOn(mockData.founderBox, 'listInbox').mockRejectedValue(new Error('down'))
    renderAt('/admin/founder-inbox')
    expect(await screen.findByText("We couldn't load the Founder Inbox")).toBeTruthy()
  })
})

describe('ai drafts', () => {
  it('edits a draft and approves it with the edit, then marks it sent', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/ai-drafts')
    const text = (await screen.findByLabelText('Text for Weekly summary: AGK Fitness')) as HTMLTextAreaElement
    fireEvent.change(text, { target: { value: 'Edited by Karthik before sending.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve Weekly summary: AGK Fitness' }))
    expect(await screen.findByText('Draft approved')).toBeTruthy()
    expect(db.ai_drafts.find((row) => row.id === 'ai-1')).toMatchObject({ status: 'approved', body: 'Edited by Karthik before sending.' })
    // Approved text is read-only.
    expect(screen.queryByLabelText('Text for Weekly summary: AGK Fitness')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mark as sent: Weekly summary: AGK Fitness' }))
    await waitFor(() => expect(db.ai_drafts.find((row) => row.id === 'ai-1')?.status).toBe('sent'))
  })

  it('separates the two kinds, and will not approve empty text', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/ai-drafts')
    await screen.findByText('Weekly summary: Raack Dance Academy')
    expect(screen.queryByLabelText('Text for Intro message: Kavya Silks')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Outreach drafts/ }))
    expect(await screen.findByLabelText('Text for Intro message: Kavya Silks')).toBeTruthy()
    // The sent one is read-only.
    expect(screen.queryByLabelText('Text for Follow-up: Pixel Pets Clinic')).toBeNull()
    fireEvent.change(screen.getByLabelText('Text for Intro message: Kavya Silks'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve Intro message: Kavya Silks' }))
    expect(await screen.findByText('The text cannot be empty.')).toBeTruthy()
    expect(db.ai_drafts.find((row) => row.id === 'ai-3')?.status).toBe('draft')
  })

  it('shows empty and error states', async () => {
    await signInAs(SEED_IDS.pm)
    vi.spyOn(mockData.aiDrafts, 'list').mockResolvedValue([])
    renderAt('/admin/ai-drafts')
    expect(await screen.findByText('No weekly summaries yet')).toBeTruthy()
    cleanup()
    vi.spyOn(mockData.aiDrafts, 'list').mockRejectedValue(new Error('down'))
    renderAt('/admin/ai-drafts')
    expect(await screen.findByText("We couldn't load the drafts")).toBeTruthy()
  })
})
