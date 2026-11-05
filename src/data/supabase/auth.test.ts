import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: () => ({
    auth: {
      signInWithPassword: authMocks.signInWithPassword,
      signOut: authMocks.signOut,
    },
    from: authMocks.from,
  }),
}))

vi.mock('./edge', () => ({ invokeFunction: vi.fn() }))

import { supabaseAuth } from './auth'

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 1_800_000_000,
  user: { id: 'auth-user-id', email: 'admin@example.com', user_metadata: { full_name: 'Admin' } },
}

describe('Supabase staff email sign-in', () => {
  beforeEach(() => {
    authMocks.signInWithPassword.mockReset().mockResolvedValue({ data: { session }, error: null })
    authMocks.signOut.mockReset().mockResolvedValue({ error: null })
    authMocks.from.mockReset().mockReturnValue({ select: authMocks.select })
    authMocks.select.mockReset().mockReturnValue({ eq: authMocks.eq })
    authMocks.eq.mockReset().mockReturnValue({ maybeSingle: authMocks.maybeSingle })
    authMocks.maybeSingle.mockReset().mockResolvedValue({
      data: { role: 'vernex_finance', is_active: true },
      error: null,
    })
  })

  it('authenticates staff email directly and verifies the active staff profile', async () => {
    await expect(
      supabaseAuth.signInWithIdentifier({ identifier: 'ADMIN@EXAMPLE.COM', password: 'valid-password' }),
    ).resolves.toMatchObject({
      user: { id: 'auth-user-id', email: 'admin@example.com', user_metadata: { full_name: 'Admin' } },
    })
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'valid-password',
    })
    expect(authMocks.from).toHaveBeenCalledWith('profiles')
    expect(authMocks.eq).toHaveBeenCalledWith('user_id', 'auth-user-id')
    expect(authMocks.signOut).not.toHaveBeenCalled()
  })

  it('signs out profiles that are not active Vernex staff', async () => {
    authMocks.maybeSingle.mockResolvedValueOnce({
      data: { role: 'client_admin', is_active: true },
      error: null,
    })
    await expect(
      supabaseAuth.signInWithIdentifier({ identifier: 'client@example.com', password: 'valid-password' }),
    ).rejects.toThrow('Invalid Client Code or password. Try again.')
    expect(authMocks.signOut).toHaveBeenCalledOnce()
  })

  it('returns Supabase Auth credential errors without querying profiles', async () => {
    authMocks.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    })
    await expect(
      supabaseAuth.signInWithIdentifier({ identifier: 'admin@example.com', password: 'wrong-password' }),
    ).rejects.toThrow('Invalid login credentials')
    expect(authMocks.from).not.toHaveBeenCalled()
  })
})
