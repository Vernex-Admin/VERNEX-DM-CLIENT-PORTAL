import type { DataLayer } from './types'

// The one place the backend is chosen. VITE_DATA_SOURCE='supabase' runs everything on Supabase;
// otherwise (and in every test) the in-memory mock. The condition is a build-time constant, so a
// Supabase build does not contain the mock at all.
// Only src/lib/queries may import this; screens use the hooks.
export const data: DataLayer =
  import.meta.env.MODE !== 'test' && import.meta.env.VITE_DATA_SOURCE === 'supabase'
    ? (await import('./supabase')).supabaseData
    : (await import('./mock')).mockData

export { DataError } from './types'
export type * from './types'
