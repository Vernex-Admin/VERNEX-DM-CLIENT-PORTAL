/** True when the app reads and signs in against Supabase instead of the in-memory mock. */
export const USES_SUPABASE = import.meta.env.VITE_DATA_SOURCE === 'supabase'
