// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui'
import { mockData } from './data/mock'
import { SEED_IDS } from './data/mock/seed'
import { resetMockData } from './data/mock/store'
import { SessionProvider } from './lib/queries'

// Pages are code-split, so the first visit to one waits for its chunk to load.
configure({ asyncUtilTimeout: 10_000 })

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
afterEach(cleanup)

describe('route guards', () => {
  it('sends a signed-out client to /login', async () => {
    await signInAs(null)
    renderAt('/billing')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.getByLabelText(/Client Code/)).toBeTruthy()
  })

  it('sends signed-out staff to the same shared login', async () => {
    await signInAs(null)
    renderAt('/admin/clients')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.getByLabelText(/Client Code/)).toBeTruthy()
  })

  it('keeps a client out of /admin/*', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/admin/clients')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  })

  it('sends signed-in staff on /login to /admin', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/login')
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeTruthy()
  })


  it('shows the access page to a PM on the Founder Inbox, and the page to the founder', async () => {
    await signInAs(SEED_IDS.pm)
    renderAt('/admin/founder-inbox')
    expect(await screen.findByText("You don't have access")).toBeTruthy()
    cleanup()
    await signInAs(SEED_IDS.founder)
    renderAt('/admin/founder-inbox')
    expect(await screen.findByRole('heading', { name: 'Founder Inbox' })).toBeTruthy()
  })

  it('shows 404 for an unknown address', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    renderAt('/nope')
    expect(await screen.findByText('Page not found')).toBeTruthy()
  })
})

describe('shared sign-in route', () => {
  it('redirects the old admin login URL to the shared Client Code form', async () => {
    await signInAs(null)
    renderAt('/admin/login')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Google|sign-in link/i })).toBeNull()
  })
})
