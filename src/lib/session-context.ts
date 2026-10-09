import { createContext, useContext } from 'react'
import type { Profile } from '../types/db'

// The signed-in profile, or null while loading or signed out. Provided by SessionProvider.
export const SessionContext = createContext<Profile | null>(null)

export function useSessionProfile(): Profile | null {
  return useContext(SessionContext)
}
