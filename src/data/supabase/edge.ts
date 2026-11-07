import { DataError } from '../types'
import { supabase } from './client'

/**
 * Calls an Edge Function and returns its JSON. Our functions answer errors as `{ error: "..." }`
 * written for people, so that sentence is what the DataError carries.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body })
  if (!error) return data as T

  let message: string | undefined
  let status: number | undefined
  if (error.context instanceof Response) {
    status = error.context.status
    try {
      const payload = (await error.context.json()) as { error?: unknown }
      if (typeof payload.error === 'string') message = payload.error
    } catch {
      // Not JSON: use the fallback.
    }
  }
  if (status === 404 && !message) {
    throw new DataError('not_set_up', `The ${name} service is not deployed yet. A Vernex admin must deploy it.`)
  }
  if (status === 401) throw new DataError('signed_out', message ?? 'Your session has ended. Sign in again.')
  if (status === 403) throw new DataError('forbidden', message ?? "You don't have permission to do that.")
  throw new DataError('invalid', message ?? fallback)
}
