import { can } from '../../lib/permissions'
import type { Action, Resource } from '../../lib/permissions'
import type { Profile } from '../../types/db'
import { DataError } from '../types'
import { createSeed, SEED_IDS } from './seed'
import type { MockDatabase } from './seed'

// In-memory tables plus the checks a real backend would make. The visibility rules here
// are the ones row-level security will enforce in Postgres.

// 300ms so loading states are visible; instant under test.
const DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 300
const STORAGE_KEY = 'vx.mock.profile'
const SIGNED_OUT = 'signed-out'

export let db: MockDatabase = createSeed()

function readStoredProfileId(): string | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (stored === SIGNED_OUT) return null
    if (stored && db.profiles.some((profile) => profile.id === stored)) return stored
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  // Nobody is signed in on a first visit, so the login pages are the way in.
  return null
}

let currentProfileId: string | null = readStoredProfileId()

export function setCurrentProfileId(id: string | null) {
  currentProfileId = id
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, id ?? SIGNED_OUT)
  } catch {
    // Not persisted; the in-memory value still applies for this page load.
  }
}

/** Tests only: fresh seed data, signed in as the founder. */
export function resetMockData() {
  db = createSeed()
  currentProfileId = SEED_IDS.founder
}

/** Runs `fn` after the mock delay and returns a copy, so callers never hold a reference into the store. */
export async function run<T>(fn: () => T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
  return structuredClone(fn())
}

export function currentProfile(): Profile | null {
  return db.profiles.find((profile) => profile.id === currentProfileId && profile.is_active) ?? null
}

export function me(): Profile {
  const profile = currentProfile()
  if (!profile) throw new DataError('signed_out', 'You are signed out.')
  return profile
}

/** The tenant rule: founder sees every client, a PM their assigned clients, a client user their own. */
export function visibleClientIds(profile: Profile): Set<string> {
  if (profile.role === 'vernex_founder') return new Set(db.clients.map((client) => client.id))
  if (profile.role === 'vernex_pm') {
    return new Set(db.client_assignments.filter((row) => row.user_id === profile.id).map((row) => row.client_id))
  }
  return new Set(profile.client_id ? [profile.client_id] : [])
}

/** Throws `forbidden` unless the signed-in user may do this, on this client if one is given. */
export function guard(resource: Resource, action: Action, clientId?: string): Profile {
  const profile = me()
  const allowed =
    can(profile, resource, action, { clientId }) && (clientId === undefined || visibleClientIds(profile).has(clientId))
  if (!allowed) throw new DataError('forbidden', `Not allowed: ${resource}:${action}`)
  return profile
}

/** Rows of a tenant table the signed-in user may see. */
export function visible<T extends { client_id: string }>(rows: T[], profile: Profile): T[] {
  const ids = visibleClientIds(profile)
  return rows.filter((row) => ids.has(row.client_id))
}

/** One visible row. A row in another tenant is reported as not found, as RLS would. */
export function readOne<T extends { id: string; client_id: string }>(rows: T[], id: string, resource: Resource): T {
  const profile = guard(resource, 'view')
  const row = rows.find((candidate) => candidate.id === id)
  if (!row || !visibleClientIds(profile).has(row.client_id)) throw new DataError('not_found', `No ${resource} ${id}`)
  return row
}

/** The row to change, after checking the signed-in user may do `action` on its client. */
export function writable<T extends { id: string; client_id: string }>(
  rows: T[],
  id: string,
  resource: Resource,
  action: Action,
): T {
  const row = rows.find((candidate) => candidate.id === id)
  guard(resource, action, row?.client_id)
  if (!row) throw new DataError('not_found', `No ${resource} ${id}`)
  return row
}

export function removeWhere<T>(rows: T[], predicate: (row: T) => boolean) {
  for (let index = rows.length - 1; index >= 0; index--) {
    if (predicate(rows[index] as T)) rows.splice(index, 1)
  }
}

export const newId = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()
