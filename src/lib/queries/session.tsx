import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

/** After any sign-in or sign-out: nothing cached for the previous user may be shown to the next one. */
function useRefreshSession() {
  const queryClient = useQueryClient()
  return async () => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== R.session })
    await queryClient.invalidateQueries()
  }
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
    onSuccess: async () => {
      queryClient.setQueryData<Profile | null>(currentProfileKey, null)
      await refresh()
    },
  })
}

/** Makes the signed-in profile available to useCan() and useSessionProfile(). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useCurrentProfile()
  return <SessionContext value={profile ?? null}>{children}</SessionContext>
}

