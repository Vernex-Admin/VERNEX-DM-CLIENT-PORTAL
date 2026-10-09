// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui'
import { mockData } from './data/mock'
import { SEED_IDS } from './data/mock/seed'
import { resetMockData } from './data/mock/store'
import { SessionProvider } from './lib/queries'

// jsdom has no <dialog> behaviour; open and close are enough for these tests.
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

describe('dashboard', () => {
  it('shows the banner with its top two items, then health, pipeline, lead, numbers and activity', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/')
    expect(await screen.findByRole('heading', { name: '4 things need you to keep moving' })).toBeTruthy()
    const banner = screen.getByRole('region', { name: 'Needs your attention' })
    expect(within(banner).getAllByRole('button')).toHaveLength(2)
    expect(within(banner).getByRole('link', { name: 'See all' })).toBeTruthy()

    expect(await screen.findByText('Waiting on you')).toBeTruthy()
    expect(await screen.findByRole('list', { name: 'Project milestones' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: /WhatsApp/ })).toBeTruthy()
    expect(await screen.findByText('Cost per lead')).toBeTruthy()
    expect(await screen.findAllByRole('img', { name: /Revision \d of \d used/ })).not.toHaveLength(0)
    expect(await screen.findByText('Working on now')).toBeTruthy()
    expect(await screen.findByText('Recent activity')).toBeTruthy()
  })

  it('opens WhatsApp with the message already typed', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/')
    const link = (await screen.findByRole('link', { name: /WhatsApp/ })) as HTMLAnchorElement
    const text = decodeURIComponent(link.href.split('text=')[1] as string)
    expect(text).toBe('Hi Karthik, this is Arun Kumar from AGK Fitness about Monthly social media')
    expect((screen.getByRole('link', { name: /Call/ }) as HTMLAnchorElement).href).toBe('tel:+919000000002')
  })

  it('says "You\u2019re all caught up" with no items', async () => {
    await signInAs(SEED_IDS.pm)
    for (const row of await mockData.actionItems.list({ client_id: SEED_IDS.agk, open: true })) {
      await mockData.actionItems.resolve(row.id)
    }
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/')
    expect(await screen.findByText('You\u2019re all caught up')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Needs your attention' })).toBeNull()
  })
})

describe('approvals', () => {
  it('lists in-review work, overdue first, and bulk-approves flagged posts', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/approvals')
    expect(await screen.findByText('Gym timings story set')).toBeTruthy()
    // The reel, the page design and the two flagged posts.
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Gym timings story set' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Diwali membership offer poster' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve 2' }))

    expect(await screen.findByText("Nice, approved. We'll lock this in.")).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Gym timings story set')).toBeNull())
  })

  it('offers no bulk approve to a member who cannot approve', async () => {
    await signInAs(SEED_IDS.agkMember)
    renderAt('/approvals')
    expect(await screen.findByText('Gym timings story set')).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

describe('deliverable', () => {
  it('asks for "I understand this is final" before approving a final item', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/deliverables/d-agk-5')
    await screen.findByRole('heading', { name: 'Membership page design' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0] as HTMLElement)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Approve Membership page design v1?' })).toBeTruthy()
    expect(within(dialog).getByText('This confirms the work meets your needs.')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Approve' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I understand this is final' }))
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    expect(await screen.findByText("Nice, approved. We'll lock this in.")).toBeTruthy()
    await waitFor(async () => expect((await mockData.deliverables.get('d-agk-5')).status).toBe('approved'))
  })

  it('does not ask a non-final item for the checkbox', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/deliverables/d-agk-1')
    await screen.findByRole('heading', { name: 'October reel: 5 AM batch transformation' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    expect((within(dialog).getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows "Your admin approves this" instead of the buttons to a member without can_approve', async () => {
    await signInAs(SEED_IDS.agkMember)
    renderAt('/deliverables/d-agk-1')
    await screen.findByRole('heading', { name: 'October reel: 5 AM batch transformation' })
    expect(screen.getAllByText('Your admin approves this').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Request revision' })).toBeNull()
  })

  it('sends a revision as "Revision 1 of 2" once the description is long enough', async () => {
    await signInAs(SEED_IDS.raackAdmin)
    renderAt('/deliverables/d-raack-1')
    await screen.findByRole('heading', { name: 'Admissions open: Bharatanatyam batch poster' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Request revision' })[0] as HTMLElement)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Revision 1 of 2')).toBeTruthy()
    fireEvent.change(within(drawer).getByLabelText(/What should change/), { target: { value: 'Too short' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Send request' }))
    expect(await within(drawer).findByText('Please write at least 20 characters.')).toBeTruthy()

    fireEvent.change(within(drawer).getByLabelText(/What should change/), {
      target: { value: 'Make the batch start date larger and move it above the fold.' },
    })
    fireEvent.change(within(drawer).getByLabelText('Priority'), { target: { value: 'urgent' } })
    expect(within(drawer).getByText('Urgent requests may affect the timeline.')).toBeTruthy()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Revision 1 of 2 sent')).toBeTruthy()
    await waitFor(async () => {
      const [revision] = await mockData.revisions.list({ deliverable_id: 'd-raack-1' })
      expect(revision?.priority).toBe('urgent')
    })
  })

  it('turns the button into "Request extra revision" at the limit and files a service request', async () => {
    await signInAs(SEED_IDS.pm)
    await mockData.deliverables.update('d-raack-1', { revisions_used: 2 })
    await signInAs(SEED_IDS.raackAdmin)
    renderAt('/deliverables/d-raack-1')
    await screen.findByRole('heading', { name: 'Admissions open: Bharatanatyam batch poster' })
    expect(screen.queryByRole('button', { name: 'Request revision' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Request extra revision' })[0] as HTMLElement)

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText('Request sent')).toBeTruthy()
    await waitFor(async () => {
      const requests = await mockData.serviceRequests.list()
      expect(requests.some((row) => row.title === 'Extra revision: Admissions open: Bharatanatyam batch poster')).toBe(true)
    })
  })

  it('lets a client comment, and switches between versions', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/deliverables/d-agk-1')
    await screen.findByRole('heading', { name: 'October reel: 5 AM batch transformation' })
    expect(await screen.findByText(/Looks good\. The ending feels rushed/)).toBeTruthy()
    // Internal notes never reach the client.
    expect(screen.queryByText(/Editor spent 3 extra hours/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: 'Love the new ending.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))
    expect(await screen.findByText('Love the new ending.')).toBeTruthy()
    const select = await screen.findByLabelText('Version')
    expect((select as HTMLSelectElement).value).toBe('2')
  })

  it('switches the preview between versions', async () => {
    await signInAs(SEED_IDS.raackAdmin)
    renderAt('/deliverables/d-raack-3')
    const select = (await screen.findByLabelText('Version')) as HTMLSelectElement
    expect(await screen.findByRole('img', { name: /version 2/ })).toBeTruthy()
    fireEvent.change(select, { target: { value: '1' } })
    expect(await screen.findByRole('img', { name: /version 1/ })).toBeTruthy()
  })

  it('does not show another client\u2019s deliverable', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/deliverables/d-raack-1')
    expect(await screen.findByText("We can't find that")).toBeTruthy()
  })
})


describe('requests', () => {
  it('sends a request and lists it with a status pill', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/requests')
    expect(await screen.findByText('Add online membership payments')).toBeTruthy()
    expect(screen.getByText('Quote ready')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText('Give your request a short title.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Photo shoot for new batch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText('Request sent')).toBeTruthy()
    expect(await screen.findByText('Photo shoot for new batch')).toBeTruthy()
  })

  it('shows a specific empty state', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    vi.spyOn(mockData.serviceRequests, 'list').mockResolvedValue([])
    renderAt('/requests')
    expect(await screen.findByText("You haven't asked for anything yet")).toBeTruthy()
  })

  it('shows an error state with Try again', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    vi.spyOn(mockData.serviceRequests, 'list').mockRejectedValue(new Error('down'))
    renderAt('/requests')
    expect(await screen.findByText("We couldn't load your requests")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('vault', () => {
  it('lists brand assets with a checklist, and marks Drive files', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/vault')
    expect(await screen.findByText('agk-logo.png')).toBeTruthy()
    expect(screen.getByText('agk-brand-colours.pdf')).toBeTruthy()
    expect(screen.getAllByText('Opens in Google Drive')).toHaveLength(1)
    // Logo and colours are in; fonts and photos are not.
    expect(screen.getByText('50% complete')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download agk-logo.png' })).toBeTruthy()
  })

  it('accepts a dropped file into Brand Assets', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    URL.createObjectURL = () => 'blob:test'
    renderAt('/vault')
    await screen.findByText('agk-logo.png')
    const file = new File(['x'], 'fonts-pack.zip', { type: 'application/zip' })
    fireEvent.drop(screen.getByText(/Drag files here/).closest('div') as HTMLElement, { dataTransfer: { files: [file] } })
    expect(await screen.findByText('File uploaded')).toBeTruthy()
    expect(await screen.findByText('fonts-pack.zip')).toBeTruthy()
  })

  it('has no upload in the other tabs, and an empty state per tab', async () => {
    await signInAs(SEED_IDS.raackAdmin)
    renderAt('/vault')
    await screen.findByText('raack-logo.svg')
    fireEvent.click(screen.getByRole('tab', { name: 'Rendered Ads' }))
    expect(await screen.findByText('No finished ads yet')).toBeTruthy()
    expect(screen.queryByLabelText('Upload brand assets')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Invoices' }))
    expect(await screen.findByText('No invoice files yet')).toBeTruthy()
  })
})

describe('performance', () => {
  it('shows seven KPIs, the sync time and the top posts, and switches range', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/performance')
    expect(await screen.findByText('Last synced 14 min ago')).toBeTruthy()
    for (const label of ['Reach', 'Views', 'Engagement', 'Followers gained', 'Ad spend', 'Leads', 'Cost per lead']) {
      expect(await screen.findByText(label)).toBeTruthy()
    }
    expect(screen.getByRole('heading', { name: 'Top 5 posts by reach' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Line chart of daily ad spend and leads over the last 30 days/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    expect(await screen.findByRole('img', { name: /last 7 days/ })).toBeTruthy()
  })

  it('shows an empty state without numbers', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    vi.spyOn(mockData.socialMetrics, 'listDaily').mockResolvedValue([])
    renderAt('/performance')
    expect(await screen.findByText('No numbers yet')).toBeTruthy()
  })
})

describe('billing', () => {
  it('shows the three totals and opens an invoice with its lines', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/billing')
    expect(await screen.findByText('Outstanding')).toBeTruthy()
    // "Overdue" is also a status pill, so the label may appear more than once.
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0)
    expect(screen.getByText('Paid this year')).toBeTruthy()
    const [first] = await screen.findAllByRole('button', { name: /^View / })
    fireEvent.click(first as HTMLElement)
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('Invoice lines')).toBeTruthy()
    expect(within(drawer).getByText('Subtotal')).toBeTruthy()
    expect(within(drawer).getByText('CGST 9%')).toBeTruthy()
  })

  it('stubs Pay now', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/billing')
    const [pay] = await screen.findAllByRole('button', { name: /^Pay now, / })
    fireEvent.click(pay as HTMLElement)
    expect(await screen.findByText('Online payment is coming soon')).toBeTruthy()
  })
})

describe('founder box', () => {
  it('defaults to private, sends, and lists the message', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/founder-box')
    // The seed already holds one past message from this user.
    expect(await screen.findByText('The Navratri posts worked')).toBeTruthy()
    const toggle = screen.getByRole('switch', { name: 'Keep this private from my project team' }) as HTMLInputElement
    expect(toggle.checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Send to the founder' }))
    expect(await screen.findByText('Add a subject.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 'Great reels' } })
    fireEvent.change(screen.getByLabelText(/Message/), { target: { value: 'The team has been brilliant this month.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to the founder' }))
    expect(await screen.findByText('Boss Anandaa will personally reply within 24 hours.')).toBeTruthy()
    expect(await screen.findByText('Great reels')).toBeTruthy()
    const sent = (await mockData.founderBox.listMine()).find((row) => row.subject === 'Great reels')
    expect(sent?.private_from_team).toBe(true)
  })

  it('shows a specific empty state and an error state', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    const list = vi.spyOn(mockData.founderBox, 'listMine').mockResolvedValue([])
    renderAt('/founder-box')
    expect(await screen.findByText("You haven't written to the founder yet")).toBeTruthy()
    cleanup()
    list.mockRejectedValue(new Error('down'))
    renderAt('/founder-box')
    expect(await screen.findByText("We couldn't load your messages")).toBeTruthy()
  })
})

describe('profile', () => {
  it('saves the name, WhatsApp number and notification choices', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/settings/profile')
    const name = (await screen.findByLabelText(/Name/)) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Arun K' } })
    fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '98765 43210' } })
    fireEvent.click(screen.getByRole('switch', { name: /Weekly performance report/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Profile saved')).toBeTruthy()
    const me = await mockData.session.getCurrentProfile()
    expect(me?.full_name).toBe('Arun K')
    expect(me?.phone_e164).toBe('+919876543210')
    expect(me?.notification_prefs.weekly_report).toBe(true)
  })

  it('rejects a bad number', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/settings/profile')
    await screen.findByLabelText(/Name/)
    fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Enter a 10-digit Indian mobile number.')).toBeTruthy()
  })
})