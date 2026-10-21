// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../types/db'
import { LoginPage } from './LoginPage'

const auth = vi.hoisted(() => ({
  profile: null as Profile | null,
  refetch: vi.fn(async () => ({ data: null as Profile | null })),
  mutateAsync: vi.fn(async (_input: { identifier: string; password: string }) => undefined),
}))

vi.mock('../../lib/queries', () => ({
  useCurrentProfile: () => ({ refetch: auth.refetch }),
  useSignInWithIdentifier: () => ({ mutateAsync: auth.mutateAsync, isPending: false }),
}))

function profile(role: Profile['role']): Profile {
  return {
    id: 'profile-id',
    client_id: role === 'client_admin' || role === 'client_member' ? 'client-id' : null,
    email: 'person@example.com',
    full_name: 'Test Person',
    phone_e164: null,
    avatar_url: null,
    role,
    can_approve: true,
    is_active: true,
    notification_prefs: { email: true, whatsapp: true, approvals: true, comments: true, invoices: true, weekly_report: false },
    created_at: new Date(0).toISOString(),
  }
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Client dashboard</p>} />
        <Route path="/admin/clients" element={<p>Staff dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  auth.profile = null
  auth.refetch.mockImplementation(async () => ({ data: auth.profile }))
  auth.mutateAsync.mockReset()
  auth.mutateAsync.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('shared identifier login', () => {
  it('shows identifier and Password, with a password visibility toggle', () => {
    renderLogin()
    expect(screen.getByRole('img', { name: 'Vernex Digital Marketing' }).getAttribute('src')).toBe('/vernex-digital-marketing.png')
    expect(screen.getByLabelText(/Client Code or Email/)).toBeTruthy()
    expect(screen.getByLabelText(/Password/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Google|sign-in link|admin login/i })).toBeNull()

    const password = screen.getByLabelText(/Password/) as HTMLInputElement
    expect(password.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password.type).toBe('password')
  })

  it('validates required inputs before contacting Supabase', async () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your Client Code or email.')).toBeTruthy()
    expect(screen.getByText('Enter your password.')).toBeTruthy()
    expect(auth.mutateAsync).not.toHaveBeenCalled()
  })

  it('routes a client to the client dashboard after Supabase returns their profile', async () => {
    auth.profile = profile('client_admin')
    renderLogin()
    fireEvent.change(screen.getByLabelText(/Client Code or Email/), { target: { value: 'vx-client-01' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Client dashboard')).toBeTruthy()
    expect(auth.mutateAsync).toHaveBeenCalledWith({ identifier: 'VX-CLIENT-01', password: 'correct-password' })
  })

  it('routes Vernex staff to the staff dashboard after Supabase returns their profile', async () => {
    auth.profile = profile('vernex_pm')
    renderLogin()
    fireEvent.change(screen.getByLabelText(/Client Code or Email/), { target: { value: 'vx-staff-01' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Staff dashboard')).toBeTruthy()
  })

  it('shows authentication errors clearly', async () => {
    auth.mutateAsync.mockRejectedValueOnce(new Error('Invalid Client Code or password. Try again.'))
    renderLogin()
    fireEvent.change(screen.getByLabelText(/Client Code or Email/), { target: { value: 'vx-client-01' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Invalid Client Code or password'))
  })

  it('accepts an admin email as the identifier', async () => {
    auth.profile = profile('vernex_founder')
    renderLogin()
    fireEvent.change(screen.getByLabelText(/Client Code or Email/), { target: { value: 'ADMIN@VERNEX.IN' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'provided-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Staff dashboard')).toBeTruthy()
    expect(auth.mutateAsync).toHaveBeenCalledWith({ identifier: 'admin@vernex.in', password: 'provided-password' })
  })
})
