// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui'
import { mockData } from './data/mock'
import { SEED_IDS } from './data/mock/seed'
import { resetMockData } from './data/mock/store'
import { SessionProvider } from './lib/queries'

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

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

beforeEach(() => resetMockData())
afterEach(cleanup)

describe('onboarding screens', () => {
  it('shows the founder the AGK checklist with both gates, and ticking an item updates progress', async () => {
    await mockData.session.switchProfile(SEED_IDS.founder)
    renderAt(`/admin/clients/${SEED_IDS.agk}?tab=onboarding`)
    expect((await screen.findAllByText('Agreement signed')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('First invoice paid').length).toBeGreaterThan(0)
    const before = screen.getByText(/of 48 done/).textContent
    const boxes = screen.getAllByRole('button', { name: /^Mark .* as done$/ })
    fireEvent.click(boxes[0]!)
    await waitFor(() => expect(screen.getByText(/of 48 done/).textContent).not.toBe(before))
  })

  it('fills a template for the chosen client and keeps unknown fields as {{field}}', async () => {
    await mockData.session.switchProfile(SEED_IDS.founder)
    renderAt('/admin/templates')
    expect(await screen.findByText('Message Templates')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Merge with client:'), { target: { value: SEED_IDS.agk } })
    await waitFor(() => expect(screen.getAllByText(/AGK Fitness/).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/\{\{kickoff_time\}\}/).length).toBeGreaterThan(0)
  })

  it('shows the client admin the setup form with their own items, and saving goes to the dashboard', async () => {
    await mockData.session.switchProfile(SEED_IDS.agkAdmin)
    renderAt('/setup')
    expect(await screen.findByRole('heading', { name: "Let's get set up" })).toBeTruthy()
    expect(screen.getByText('Later')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: "Let's get set up" })).toBeNull())
    expect((await mockData.clients.get(SEED_IDS.agk)).onboarding_answers).not.toBeNull()
  })

  it('lists sent and signed documents in the Vault, never drafts', async () => {
    await mockData.session.switchProfile(SEED_IDS.raackAdmin)
    renderAt('/vault')
    fireEvent.click(await screen.findByRole('tab', { name: 'Documents' }))
    expect(await screen.findByText('Raack Dance Academy Services Agreement')).toBeTruthy()
    expect(screen.queryByText('Raack Growth Strategy')).toBeNull()
  })
})
