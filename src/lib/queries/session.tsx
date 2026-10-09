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

/** Development only: sign in as a seeded profile, or pass null to sign out. */
export function useSwitchProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (profileId: string | null) => data.session.switchProfile(profileId),
    onSuccess: async (profile) => {
      // Nothing cached for the previous user may be shown to the next one.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== R.session })
      queryClient.setQueryData<Profile | null>(currentProfileKey, profile)
      await queryClient.invalidateQueries()
    },
  })
}

/** Makes the signed-in profile available to useCan() and useSessionProfile(). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useCurrentProfile()
  return <SessionContext value={profile ?? null}>{children}</SessionContext>
}
