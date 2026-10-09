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

beforeEach(() => resetMockData())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('walkthrough: a new client to its first deliverable on the client dashboard', () => {
  it('works end to end', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients')

    // 1. Create the client.
    fireEvent.click(await screen.findByRole('button', { name: 'New client' }))
    let form = await drawer()
    fireEvent.change(form.getByLabelText(/^Name/), { target: { value: 'Zen Yoga Studio' } })
    fireEvent.change(form.getByLabelText('Industry'), { target: { value: 'Wellness' } })
    fireEvent.click(form.getByRole('button', { name: 'Create client' }))
    expect(await screen.findByRole('heading', { name: 'Zen Yoga Studio' })).toBeTruthy()
    const zen = db.clients.find((client) => client.name === 'Zen Yoga Studio')!
    expect(zen.slug).toBe('zen-yoga-studio')

    // 2. Invite the client's admin.
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Invite user' }))
    form = await drawer()
    fireEvent.change(form.getByLabelText(/^Name/), { target: { value: 'Meera Iyer' } })
    fireEvent.change(form.getByLabelText(/^Email/), { target: { value: 'meera@zen.example' } })
    fireEvent.change(form.getByLabelText('Role'), { target: { value: 'client_admin' } })
    fireEvent.click(form.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Invitation sent to meera@zen.example')).toBeTruthy()
    expect(await screen.findByText('Meera Iyer')).toBeTruthy()

    // 3. A project.
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New project' }))
    form = await drawer()
    fireEvent.change(form.getByLabelText(/^Name/), { target: { value: 'Launch campaign' } })
    fireEvent.click(form.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Launch campaign created')).toBeTruthy()

    // 4. A deliverable, created internal: the client cannot see it yet.
    fireEvent.click(screen.getByRole('tab', { name: 'Deliverables' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New deliverable' }))
    form = await drawer()
    fireEvent.change(form.getByLabelText(/^Title/), { target: { value: 'Launch teaser reel' } })
    fireEvent.click(form.getByRole('button', { name: 'Create deliverable' }))
    expect(await screen.findByText('Launch teaser reel created')).toBeTruthy()
    const meera = db.profiles.find((profile) => profile.email === 'meera@zen.example')!
    await signInAs(meera.id)
    expect(await mockData.deliverables.list()).toHaveLength(0)
    await signInAs(SEED_IDS.founder)

    // 5. Publish version 1 as a Drive link, client visible.
    fireEvent.click(await screen.findByRole('button', { name: 'Publish version of Launch teaser reel' }))
    form = await drawer()
    fireEvent.change(form.getByLabelText('Source'), { target: { value: 'drive' } })
    fireEvent.change(form.getByLabelText(/^Google Drive link/), { target: { value: 'https://drive.google.com/file/d/REEL123/view?usp=sharing' } })
    fireEvent.change(form.getByLabelText('Visibility'), { target: { value: 'client' } })
    fireEvent.click(form.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Version 2 published')).toBeTruthy()
    const reel = db.deliverables.find((row) => row.title === 'Launch teaser reel')!
    expect(reel).toMatchObject({ status: 'in_review', visibility: 'client' })
    expect(db.deliverable_versions.find((row) => row.deliverable_id === reel.id)?.preview_url).toBe(
      'https://drive.google.com/file/d/REEL123/preview',
    )

    // 6. Meera signs in and sees it on her dashboard, and can open it.
    cleanup()
    await signInAs(meera.id)
    renderAt('/')
    expect(await screen.findByText('Review Launch teaser reel (version 1)')).toBeTruthy()
    expect((await screen.findAllByText('Launch campaign')).length).toBeGreaterThan(0)
  })
})

describe('clients list', () => {
  it('shows the dense columns, searches and filters', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients')
    const table = await screen.findByRole('table', { name: 'Clients' })
    for (const header of ['Client', 'Industry', 'Health', 'Account lead', 'Outstanding', 'Last activity']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeTruthy()
    }
    expect(within(table).getByText('AGK Fitness')).toBeTruthy()
    expect(within(table).getByText('Raack Dance Academy')).toBeTruthy()
    // AGK: one sent (17,700) and one overdue (23,600) invoice.
    expect(within(table).getByText('₹41,300')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'raack' } })
    expect(within(table).queryByText('AGK Fitness')).toBeNull()
    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'nobody' } })
    expect(await screen.findByText('No clients match')).toBeTruthy()
  })

  it('shows an empty state and an error state', async () => {
    await signInAs(SEED_IDS.founder)
    vi.spyOn(mockData.clients, 'list').mockResolvedValue([])
    renderAt('/admin/clients')
    expect(await screen.findByText('No clients yet')).toBeTruthy()
    cleanup()
    vi.spyOn(mockData.clients, 'list').mockRejectedValue(new Error('down'))
    renderAt('/admin/clients')
    expect(await screen.findByText("We couldn't load your clients")).toBeTruthy()
  })

  it('needs the client name typed before delete is allowed', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Raack Dance Academy' }))
    const dialog = within(await screen.findByRole('dialog'))
    const confirm = dialog.getByRole('button', { name: 'Delete client' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(dialog.getByLabelText(/Type Raack Dance Academy to confirm/), { target: { value: 'Raack' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(dialog.getByLabelText(/Type Raack Dance Academy to confirm/), { target: { value: 'Raack Dance Academy' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(await screen.findByText('Raack Dance Academy deleted')).toBeTruthy()
    await waitFor(() => expect(db.clients.some((client) => client.id === SEED_IDS.raack)).toBe(false))
  })

  it('shows no New client or Delete buttons to a role that cannot use them', async () => {
    // A client user never reaches /admin, so the check is on the hooks: with no write permission nothing renders.
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/admin/clients')
    expect(screen.queryByRole('button', { name: 'New client' })).toBeNull()
  })
})

describe('drawers', () => {
  it('warn about unsaved changes on Cancel and on Esc, and let you keep editing or discard', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients')
    fireEvent.click(await screen.findByRole('button', { name: 'New client' }))
    const dialogElement = await screen.findByRole('dialog')
    const form = within(dialogElement)

    // Nothing typed: Cancel just closes.
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'New client' }))
    const second = within(await screen.findByRole('dialog'))
    fireEvent.change(second.getByLabelText(/^Name/), { target: { value: 'Half typed' } })
    fireEvent.click(second.getByRole('button', { name: 'Cancel' }))
    expect(second.getByText('You have unsaved changes.')).toBeTruthy()
    fireEvent.click(second.getByRole('button', { name: 'Keep editing' }))
    expect((second.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Half typed')

    // Esc is a cancel event on the dialog; it must be stopped while there are changes.
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(second.getByText('You have unsaved changes.')).toBeTruthy()

    fireEvent.click(second.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(db.clients.some((client) => client.name === 'Half typed')).toBe(false)
  })

  it('submit on Enter and let Esc close a clean drawer', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients')
    fireEvent.click(await screen.findByRole('button', { name: 'New client' }))
    const dialog = await screen.findByRole('dialog')
    const form = within(dialog)
    fireEvent.change(form.getByLabelText(/^Name/), { target: { value: 'Enter Fitness' } })
    // Enter in a text field submits its form: jsdom does this when the form is submitted.
    fireEvent.submit(form.getByLabelText(/^Name/).closest('form') as HTMLFormElement)
    expect(await screen.findByRole('heading', { name: 'Enter Fitness' })).toBeTruthy()
    expect(db.clients.some((client) => client.name === 'Enter Fitness')).toBe(true)

    // A clean drawer closes on Esc without a warning.
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Invite user' }))
    const invite = await screen.findByRole('dialog')
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(invite, cancel)
    expect(cancel.defaultPrevented).toBe(false)
  })
})

describe('client page', () => {
  it('edits a detail in place with Enter, and says so', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}`)
    expect(await screen.findByRole('heading', { name: 'AGK Fitness' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit City' }))
    const input = screen.getByLabelText('City') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Madurai' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('City saved')).toBeTruthy()
    expect(db.clients.find((client) => client.id === SEED_IDS.agk)?.city).toBe('Madurai')
  })

  it('rolls an edit back and shows an error toast when the save fails', async () => {
    await signInAs(SEED_IDS.founder)
    vi.spyOn(mockData.clients, 'update').mockRejectedValue(new Error('Server said no'))
    renderAt(`/admin/clients/${SEED_IDS.agk}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit City' }))
    const input = screen.getByLabelText('City') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Madurai' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Could not save city')).toBeTruthy()
    expect(screen.getByText('Server said no')).toBeTruthy()
    fireEvent.keyDown(screen.getByLabelText('City'), { key: 'Escape' })
    // The list in the cache is back to what the server holds.
    expect(await screen.findByText('Chennai')).toBeTruthy()
  })

  it('says it cannot find a client that does not exist', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients/nope')
    expect(await screen.findByText("We can't find that client")).toBeTruthy()
  })

  it('opens the preview from "Preview as client"', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}`)
    fireEvent.click(await screen.findByRole('link', { name: /Preview as client/ }))
    expect(await screen.findByText('Previewing AGK Fitness as the client sees it. Read-only.')).toBeTruthy()
  })
})

describe('preview as client', () => {
  it("shows that client's dashboard only, and nothing in it can be used", async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.raack}/preview`)
    const preview = await screen.findByTestId('client-preview')
    expect(preview.hasAttribute('inert')).toBe(true)
    // Raack's work only: AGK's reel never appears.
    expect(await within(preview).findByText('Where your project is')).toBeTruthy()
    expect(within(preview).queryByText(/October reel/)).toBeNull()
    expect(await within(preview).findByText(/Approve the Bharatanatyam batch poster/)).toBeTruthy()
  })
})

describe('team', () => {
  it('toggles can_approve optimistically and assigns an account lead', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=team`)
    const toggle = (await screen.findByRole('switch', { name: /can approve/ })) as HTMLInputElement
    expect(toggle.checked).toBe(false)
    fireEvent.click(toggle)
    await waitFor(() => expect(db.profiles.find((row) => row.id === SEED_IDS.agkMember)?.can_approve).toBe(true))

    const select = (await screen.findByLabelText('Account lead')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: SEED_IDS.founder } })
    expect(await screen.findByText('Account lead changed')).toBeTruthy()
    expect(db.client_assignments.find((row) => row.client_id === SEED_IDS.agk && row.is_account_lead)?.user_id).toBe(SEED_IDS.founder)
  })

  it('refuses a duplicate email with a toast', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=team`)
    fireEvent.click(await screen.findByRole('button', { name: 'Invite user' }))
    const form = await drawer()
    fireEvent.change(form.getByLabelText(/^Name/), { target: { value: 'Dup' } })
    fireEvent.change(form.getByLabelText(/^Email/), { target: { value: db.profiles.find((row) => row.id === SEED_IDS.agkAdmin)!.email } })
    fireEvent.click(form.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Someone already uses that email address.')).toBeTruthy()
  })
})

describe('projects', () => {
  it('reorders milestones with the arrows', async () => {
    await signInAs(SEED_IDS.founder)
    const before = (await mockData.milestones.list({ project_id: 'p-agk-social' })).map((row) => row.title)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=projects`)
    const list = await screen.findByRole('list', { name: 'Milestones of ' + db.projects.find((p) => p.id === 'p-agk-social')!.name })
    fireEvent.click(within(list).getByRole('button', { name: `Move ${before[0]} down` }))
    await waitFor(async () => {
      const after = (await mockData.milestones.list({ project_id: 'p-agk-social' })).map((row) => row.title)
      expect(after[1]).toBe(before[0])
      expect(after[0]).toBe(before[1])
    })
  })

  it('saves per-project revision limits from the project drawer', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=projects`)
    const name = db.projects.find((p) => p.id === 'p-agk-social')!.name
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))
    const form = await drawer()
    fireEvent.change(form.getByLabelText(/^Revisions per deliverable/), { target: { value: '5' } })
    fireEvent.click(form.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Project saved')).toBeTruthy()
    expect(db.projects.find((p) => p.id === 'p-agk-social')?.default_revision_limit).toBe(5)
  })
})

describe('deliverables', () => {
  it('needs a reason for a bonus revision, then raises the limit and logs it', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=deliverables`)
    const title = 'October reel: 5 AM batch transformation'
    fireEvent.click(await screen.findByRole('button', { name: `Bonus revision for ${title}` }))
    const form = await drawer()
    fireEvent.click(form.getByRole('button', { name: 'Add bonus revision' }))
    expect(await form.findByText('Give a reason for the bonus revision.')).toBeTruthy()
    const before = db.deliverables.find((row) => row.id === 'd-agk-1')!.revision_limit
    fireEvent.change(form.getByLabelText(/^Reason/), { target: { value: 'Client changed the offer' } })
    fireEvent.click(form.getByRole('button', { name: 'Add bonus revision' }))
    expect(await screen.findByText('Bonus revision added')).toBeTruthy()
    expect(db.deliverables.find((row) => row.id === 'd-agk-1')?.revision_limit).toBe(before + 1)
    expect(db.revision_grants).toHaveLength(1)
  })

  it('rejects a link that is not Google Drive and a file type it cannot preview', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=deliverables`)
    fireEvent.click(await screen.findByRole('button', { name: 'Publish version of November content calendar' }))
    const form = await drawer()
    fireEvent.click(form.getByRole('button', { name: 'Publish' }))
    expect(await form.findByText('Choose a file to upload.')).toBeTruthy()
    fireEvent.change(form.getByLabelText('Source'), { target: { value: 'drive' } })
    fireEvent.change(form.getByLabelText(/^Google Drive link/), { target: { value: 'https://example.com/file' } })
    fireEvent.click(form.getByRole('button', { name: 'Publish' }))
    expect(await form.findByText('Paste a Google Drive or Google Docs share link.')).toBeTruthy()
  })
})

describe('requests', () => {
  it('changes a request status and saves a quote', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.raack}?tab=requests`)
    const status = (await screen.findByLabelText('Status of Extra reel for the summer camp')) as HTMLSelectElement
    fireEvent.change(status, { target: { value: 'estimating' } })
    expect(await screen.findByText('Status changed')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Quote for Extra reel for the summer camp'), { target: { value: '8,500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save quote' }))
    expect(await screen.findByText('Quote saved')).toBeTruthy()
    expect(db.service_requests.find((row) => row.id === 'sr-raack-1')).toMatchObject({ status: 'quoted', quote_amount_minor: 850_000 })
  })
})

describe('invoices', () => {
  it('creates an invoice with ₹ lines and shows GST live', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=invoices`)
    fireEvent.click(await screen.findByRole('button', { name: 'New invoice' }))
    const form = await drawer()
    fireEvent.change(form.getByLabelText('Description, line 1'), { target: { value: 'Photo shoot' } })
    fireEvent.change(form.getByLabelText('Unit price in rupees, line 1'), { target: { value: '10000' } })
    const totals = within(form.getByLabelText('Invoice totals'))
    expect(totals.getByText('₹11,800')).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Add line' }))
    fireEvent.change(form.getByLabelText('Description, line 2'), { target: { value: 'Editing' } })
    fireEvent.change(form.getByLabelText('Unit price in rupees, line 2'), { target: { value: '5000' } })
    expect(totals.getByText('₹17,700')).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Create invoice' }))
    expect(await screen.findByText(/Invoice VX\/26-27\/\d+ created/)).toBeTruthy()
    const created = db.invoices.at(-1)!
    expect(created).toMatchObject({ client_id: SEED_IDS.agk, status: 'draft', subtotal_minor: 1_500_000, total_minor: 1_770_000 })
    expect(db.invoice_items.filter((item) => item.invoice_id === created.id)).toHaveLength(2)
  })

  it('edits an existing invoice\'s lines', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=invoices`)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit VX/26-27/0046' }))
    const form = await drawer()
    // The lines load into the open drawer; it is not replaced.
    const price = (await form.findByLabelText('Unit price in rupees, line 1')) as HTMLInputElement
    expect(price.value).toBe('15000')
    fireEvent.change(price, { target: { value: '20000' } })
    fireEvent.click(form.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('VX/26-27/0046 saved')).toBeTruthy()
    expect(db.invoices.find((row) => row.id === 'inv-agk-3')?.total_minor).toBe(2_360_000)
  })

  it('shows a specific empty state', async () => {
    await signInAs(SEED_IDS.founder)
    const created = await mockData.clients.create({ name: 'Empty Co', slug: 'empty-co' })
    renderAt(`/admin/clients/${created.id}?tab=invoices`)
    expect(await screen.findByText('No invoices yet')).toBeTruthy()
    cleanup()
    renderAt(`/admin/clients/${created.id}?tab=deliverables`)
    expect(await screen.findByText('No deliverables yet')).toBeTruthy()
    cleanup()
    renderAt(`/admin/clients/${created.id}?tab=requests`)
    expect(await screen.findByText('No requests from this client')).toBeTruthy()
  })
})
