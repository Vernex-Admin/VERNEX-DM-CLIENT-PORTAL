import { mockData } from './mock'
import type { DataLayer } from './types'

// The one place the backend is chosen. Swap in the Supabase implementation here later.
// Only src/lib/queries may import this; screens use the hooks.
export const data: DataLayer = mockData

export { DataError } from './types'
export type * from './types'
