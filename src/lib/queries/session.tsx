import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { data } from '../../data'
import type { Profile } from '../../types/db'
import { SessionContext } from '../session-context'
import { keys, R } from './keys'

const currentProfileKey = keys.detail(R.session, 'current')

/** The signed-in profile; `data` is null when signed out. */
export function useCurrentProfile() {
  return useQuery({ queryKey: currentProfileKey, queryFn: () => data.session.getCurrentProfile() })
}

/** Development only: every seeded profile, for the user picker. */
export function useSwitchableProfiles() {
  return useQuery({
    queryKey: keys.list(R.session),
    queryFn: () => data.session.listSwitchableProfiles(),
    enabled: import.meta.env.DEV,
  })
}

/**
 * After any sign-in or sign-out: nothing cached for the previous user may be shown to the next one.
 * In-flight requests are cancelled first so a late answer cannot refill the cache, and finished
 * mutation results (which can hold a client's data) are dropped too.
 */
async function dropCachedData(queryClient: QueryClient) {
  await queryClient.cancelQueries()
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== R.session })
  queryClient.getMutationCache().clear()
  await queryClient.invalidateQueries()
}

function useRefreshSession() {
  const queryClient = useQueryClient()
  return () => dropCachedData(queryClient)
}

/** Development only: sign in as a seeded profile, or pass null to sign out. */
export function useSwitchProfile() {
  const queryClient = useQueryClient()
  const refresh = useRefreshSession()
  return useMutation({
    mutationFn: (profileId: string | null) => data.session.switchProfile(profileId),
    onSuccess: async (profile) => {
      queryClient.setQueryData<Profile | null>(currentProfileKey, profile)
      await refresh()
    },
  })
}

/** Realtime sign in with email and password. */
export function useSignInWithPassword() {
  const queryClient = useQueryClient()
  const refresh = useRefreshSession()
  return useMutation({
    mutationFn: (input: { email: string; password?: string }) => data.auth.signInWithPassword(input),
    onSuccess: async () => {
      await refresh()
      await queryClient.invalidateQueries({ queryKey: currentProfileKey })
    },
  })
}

/** Email or Client Code sign-in resolves the account inside Supabase before checking the password. */
export function useSignInWithIdentifier() {
  const queryClient = useQueryClient()
  const refresh = useRefreshSession()
  return useMutation({
    mutationFn: (input: { identifier: string; password: string }) => data.auth.signInWithIdentifier(input),
    onSuccess: async () => {
      await refresh()
      await queryClient.invalidateQueries({ queryKey: currentProfileKey })
    },
  })
}

/** Sends the sign-in link. Signing in happens when the link is opened. */
export function useSignInWithOtp() {
  return useMutation({ mutationFn: (input: { email: string }) => data.auth.signInWithOtp(input) })
}

/** Development only: stands in for opening the emailed link. */
export function useVerifyOtp() {
  const refresh = useRefreshSession()
  return useMutation({
    mutationFn: (input: { email: string }) => data.auth.verifyOtp(input),
    onSuccess: refresh,
  })
}

export function useSignInWithOAuth() {
  const refresh = useRefreshSession()
  return useMutation({
    mutationFn: (input: { provider: 'google'; email?: string }) => data.auth.signInWithOAuth(input),
    onSuccess: refresh,
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  const refresh = useRefreshSession()
  return useMutation({
    mutationFn: () => data.auth.signOut(),
    // onSettled, not onSuccess: even if the sign-out request fails, this screen must not keep the data.
    onSettled: async () => {
      queryClient.setQueryData<Profile | null>(currentProfileKey, null)
      await refresh()
    },
  })
}

/** Makes the signed-in profile available to useCan() and useSessionProfile(). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useCurrentProfile()
  const queryClient = useQueryClient()

  // A different person signing in, or the session ending (also from another tab): nothing cached
  // for the last person may stay, and the session query is read again.
  useEffect(
    () =>
      data.auth.onAuthChange(() => {
        void dropCachedData(queryClient)
      }),
    [queryClient],
  )

  return <SessionContext value={profile ?? null}>{children}</SessionContext>
}

