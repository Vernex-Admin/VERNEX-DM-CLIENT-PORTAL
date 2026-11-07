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

beforeEach(() => resetMockData())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
