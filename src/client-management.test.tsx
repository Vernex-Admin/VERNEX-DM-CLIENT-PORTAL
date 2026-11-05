// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui'
import { mockData } from './data/mock'
import { SEED_IDS, SEED_PASSWORDS } from './data/mock/seed'
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

const signInAs = (id: string | null) => mockData.session.switchProfile(id)

beforeEach(() => resetMockData())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('admin navigation', () => {
  it('has Client Management, and no Pipeline or Templates', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/pipeline')
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeTruthy()
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!
    expect(within(nav).getByRole('link', { name: 'Client Management' })).toBeTruthy()
    expect(within(nav).queryByRole('link', { name: 'Pipeline' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Templates' })).toBeNull()
  })
})

describe('new client', () => {
  it('gets the next Client Code and a login, and shows the sign-in details to pass on', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients')
    fireEvent.click(await screen.findByRole('button', { name: 'New client' }))
    const form = within(await screen.findByRole('dialog'))
    fireEvent.change(form.getByLabelText(/^Name/), { target: { value: 'Zen Yoga Studio' } })
    fireEvent.change(form.getByLabelText('Contact person'), { target: { value: 'Meera Iyer' } })
    fireEvent.change(form.getByLabelText(/^Password/), { target: { value: 'Zenyoga-2026' } })
    fireEvent.click(form.getByRole('button', { name: 'Create client' }))

    const done = within(await screen.findByRole('dialog', { name: 'Client created: share these sign-in details' }))
    expect(done.getByText('VXC-1003')).toBeTruthy()
    expect(done.getByText('Zenyoga-2026')).toBeTruthy()
    const zen = db.clients.find((client) => client.name === 'Zen Yoga Studio')!
    const person = db.profiles.find((row) => row.client_id === zen.id)!
    expect(person).toMatchObject({ full_name: 'Meera Iyer', role: 'client_admin', login_code: 'VXC-1003' })

    // The client can now sign in with it.
    await signInAs(null)
    await expect(mockData.auth.signInWithIdentifier({ identifier: 'VXC-1003', password: 'Zenyoga-2026' })).resolves.toBeTruthy()
  })

  it('refuses a weak password before creating anything', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/clients')
    fireEvent.click(await screen.findByRole('button', { name: 'New client' }))
    const form = within(await screen.findByRole('dialog'))
    fireEvent.change(form.getByLabelText(/^Name/), { target: { value: 'Weak Co' } })
    fireEvent.change(form.getByLabelText(/^Password/), { target: { value: 'abc' } })
    fireEvent.click(form.getByRole('button', { name: 'Create client' }))
    expect(await form.findByText('Use at least 8 characters.')).toBeTruthy()
    expect(db.clients.some((client) => client.name === 'Weak Co')).toBe(false)
  })
})

describe('Client Management', () => {
  it('lists codes and logins, reveals a password, and filters by details status', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/client-management')
    expect(await screen.findByRole('heading', { name: 'Client Management' })).toBeTruthy()
    const table = within(await screen.findByRole('table', { name: 'Client logins and details' }))
    expect(table.getAllByText('VXC-1001').length).toBeGreaterThan(0)
    expect(table.getAllByText('VXC-1002').length).toBeGreaterThan(0)
    expect(table.queryByText(SEED_PASSWORDS.agkAdmin)).toBeNull()

    fireEvent.click(table.getAllByRole('button', { name: 'Show password' })[0]!)
    expect(table.getByText(SEED_PASSWORDS.agkAdmin)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'submitted' } })
    await waitFor(() => expect(table.queryByText('Raack Dance Academy')).toBeNull())
    expect(table.getByText('AGK Fitness')).toBeTruthy()
  })

  it('locks a client’s details and gives a new password', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/client-management')
    fireEvent.click(await screen.findByRole('button', { name: 'Lock AGK Fitness details' }))
    expect(await screen.findByText('AGK Fitness locked')).toBeTruthy()
    expect(db.clients.find((client) => client.id === SEED_IDS.agk)?.details_locked_at).not.toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'New password' })[0]!)
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText(/^Password/), { target: { value: 'Brandnew-77' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Change password' }))
    expect(await dialog.findByText('Brandnew-77')).toBeTruthy()
    expect(db.client_credentials.find((row) => row.login_code === 'VXC-1001')?.password).toBe('Brandnew-77')
  })

  it('sets up a login for a person who has none', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.raack}?tab=login`)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up login' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Set up login' }))
    expect(await dialog.findByText('VXC-1002-2')).toBeTruthy()
  })
})

describe('client details', () => {
  it('lets the client fill in and send their details, with required fields checked', async () => {
    await signInAs(SEED_IDS.raackAdmin)
    renderAt('/details')
    expect(await screen.findByRole('heading', { name: 'My details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send to Vernex' }))
    expect(await screen.findByText('Enter registered business name.')).toBeTruthy()

    const values: Record<string, string> = {
      'Registered business name': 'Raack Dance Academy LLP',
      Industry: 'Dance',
      'Contact person': 'Meena Raghavan',
      'Mobile number': '9000000021',
      'Email address': 'meena@raackdance.example',
      'Business address': '4 Music Road',
      City: 'Chennai',
      State: 'Tamil Nadu',
      'PIN code': '600017',
    }
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Send to Vernex' }))
    expect(await screen.findByText('Details sent to Vernex')).toBeTruthy()
    const raack = db.clients.find((client) => client.id === SEED_IDS.raack)!
    expect(raack.details_submitted_at).not.toBeNull()
    expect(raack.details?.legal_name).toBe('Raack Dance Academy LLP')
  })

  it('shows locked details read-only to the client', async () => {
    await mockData.clients.setDetailsLocked(SEED_IDS.agk, true)
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/details')
    expect(await screen.findByText(/Vernex locked these details/)).toBeTruthy()
    expect(screen.getByText('AGK Fitness Private Limited')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Send/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('lets Vernex add a field for one client, which that client then sees', async () => {
    await signInAs(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=details`)
    fireEvent.click(await screen.findByRole('button', { name: 'Customise form' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add field' }))
    const labels = screen.getAllByPlaceholderText('Label')
    fireEvent.change(labels[labels.length - 1]!, { target: { value: 'Preferred shoot days' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
    expect(await screen.findByText('Form saved for this client')).toBeTruthy()
    const fields = db.clients.find((client) => client.id === SEED_IDS.agk)?.detail_fields
    expect(fields?.at(-1)).toMatchObject({ key: 'custom_preferred_shoot_days', label: 'Preferred shoot days' })
    expect(db.clients.find((client) => client.id === SEED_IDS.raack)?.detail_fields).toBeNull()
  })
})

describe('client sign-in and password', () => {
  it('signs a client in with their Client Code and shows Getting started', async () => {
    await signInAs(null)
    renderAt('/login')
    fireEvent.change(await screen.findByLabelText(/Client Code or Email/), { target: { value: 'vxc-1002' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: SEED_PASSWORDS.raackAdmin } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Getting started' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Start/ }).getAttribute('href')).toBe('/details')
  })

  it('lets the client change their password from Profile', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/settings/profile')
    const form = within(await screen.findByRole('form', { name: 'Change password' }))
    expect((screen.getByLabelText(/^Client Code/) as HTMLInputElement).value).toBe('VXC-1001')
    fireEvent.change(form.getByLabelText(/^Current password/), { target: { value: SEED_PASSWORDS.agkAdmin } })
    fireEvent.change(form.getByLabelText(/^New password/), { target: { value: 'Mine-2027' } })
    fireEvent.change(form.getByLabelText(/^Confirm new password/), { target: { value: 'Mine-2027' } })
    fireEvent.click(form.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Password changed')).toBeTruthy()
    expect(db.client_credentials.find((row) => row.profile_id === SEED_IDS.agkAdmin)).toMatchObject({ password: 'Mine-2027', set_by: 'client' })
  })
})
