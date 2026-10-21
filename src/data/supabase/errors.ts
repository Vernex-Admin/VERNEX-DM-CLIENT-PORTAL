import { isWebLink } from '../../lib/links'
import { DataError } from '../types'

type PgLike = { code?: string; message?: string; status?: number }

/**
 * PostgREST / Postgres codes for "that table, column or function does not exist": the database is
 * behind the app (a migration in supabase/migrations has not been applied), not a network problem.
 */
const MISSING_SCHEMA = new Set(['PGRST205', 'PGRST202', 'PGRST204', '42P01', '42703', '42883'])
export const NOT_SET_UP_MESSAGE =
  "This needs a database update that hasn't been installed yet. A Vernex admin must apply the latest Supabase migrations."

/** Replacement messages by Postgres / PostgREST code, for one call. */
export type ErrorMessages = Partial<Record<string, string>>

/**
 * Every Supabase error becomes a DataError. Our own functions raise P0001 with a sentence meant
 * for people, so that is shown as it is; no other raw database text ever reaches the screen.
 */
export function toDataError(error: PgLike, messages: ErrorMessages = {}): DataError {
  if (error instanceof DataError) return error
  const code = error.code ?? ''
  const message = error.message ?? ''

  if (MISSING_SCHEMA.has(code)) {
    // Whoever deployed it can see exactly what is missing; people see a plain sentence.
    console.error(`Supabase schema is out of date (${code}): ${message}. Apply supabase/migrations with \`supabase db push\`.`)
    return new DataError('not_set_up', NOT_SET_UP_MESSAGE)
  }
  if (code === 'P0001') return new DataError('invalid', message)
  if (code === '42501' || /row-level security/i.test(message)) {
    return new DataError('forbidden', messages['42501'] ?? "You don't have permission to do that.")
  }
  if (code === 'PGRST116') return new DataError('not_found', messages.PGRST116 ?? "We couldn't find that.")
  if (code === 'PGRST301' || code === 'PGRST303' || error.status === 401 || /jwt/i.test(message)) {
    return new DataError('signed_out', 'Your session has ended. Sign in again.')
  }

  const custom = messages[code]
  if (custom) return new DataError('invalid', custom)
  if (code === '23505') return new DataError('invalid', 'That already exists.')
  if (code === '23503') return new DataError('invalid', 'That is still in use, or refers to something that is gone.')
  if (code === '23502' || code === '23514' || code === '22P02' || code === '22007') {
    return new DataError('invalid', 'Check the details and try again.')
  }
  return new DataError('invalid', 'Something went wrong. Try again.')
}

type Result = PromiseLike<{ data: unknown; error: PgLike | null }>

/** A list query: its rows, or a DataError. */
export async function rows<T>(query: Result, messages?: ErrorMessages): Promise<T[]> {
  const { data, error } = await query
  if (error) throw toDataError(error, messages)
  return (data ?? []) as T[]
}

/** A query that ends in .single(): its row, or a DataError. */
export async function row<T>(query: Result, messages?: ErrorMessages): Promise<T> {
  const { data, error } = await query
  if (error) throw toDataError(error, messages)
  return data as T
}

/** A query that ends in .maybeSingle(): its row, or null when there is none. */
export async function maybeRow<T>(query: Result, messages?: ErrorMessages): Promise<T | null> {
  const { data, error } = await query
  if (error) throw toDataError(error, messages)
  return (data ?? null) as T | null
}

/**
 * A delete, which RLS can quietly turn into "nothing deleted". Ask for the deleted ids back and
 * report `refused` when there were none.
 */
export async function deleted(query: Result, refused: DataError): Promise<void> {
  const { data, error } = await query
  if (error) throw toDataError(error)
  if (!Array.isArray(data) || data.length === 0) throw refused
}

/** A patch without the columns nobody may change: the id, the tenant key and the clock. */
export function cleanPatch(patch: object, also: readonly string[] = []): Record<string, unknown> {
  const blocked = new Set(['id', 'client_id', 'created_at', ...also])
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => !blocked.has(key) && value !== undefined))
}

/** A stored link must be a web address: `javascript:` and friends never reach the database. */
export function webLink(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null
  if (!isWebLink(value)) throw new DataError('invalid', 'Links must start with https://')
  return value.trim()
}
