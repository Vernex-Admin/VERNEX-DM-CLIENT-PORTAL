// What the sign-in screens say, and the two small notes that survive a page change:
// "your access was removed" (shown once on the login page) and "where you were going".

export const NOT_INVITED_MESSAGE = "This email isn't on the Vernex Hub list yet. Ask your Vernex contact to add you."
export const ACCESS_REMOVED_MESSAGE = 'Your access has been removed. Contact Vernex.'

/** Supabase refuses an uninvited email with "Database error saving new user" (our trigger raised). */
export function isNotInvited(raw: string): boolean {
  return /database error saving new user|has not been invited/i.test(raw)
}

/** The sentence to show for a raw sign-in error: friendly for uninvited emails, otherwise as given. */
export function signInErrorMessage(raw: string): string {
  return isNotInvited(raw) ? NOT_INVITED_MESSAGE : raw || 'Could not sign you in. Try again.'
}

const ACCESS_REMOVED_KEY = 'vx.accessRemoved'
const RETURN_KEY = 'vx.returnTo'

function store(kind: 'session' | 'local'): Storage | null {
  try {
    return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage
  } catch {
    return null
  }
}

export function rememberAccessRemoved() {
  try {
    store('session')?.setItem(ACCESS_REMOVED_KEY, '1')
  } catch {
    // Not persisted; the person just signs in again.
  }
}

/** True when access was removed; pass `consume` to also clear the note so it shows once. */
export function takeAccessRemoved(consume = true): boolean {
  try {
    const storage = store('session')
    const flagged = storage?.getItem(ACCESS_REMOVED_KEY) === '1'
    if (flagged && consume) storage?.removeItem(ACCESS_REMOVED_KEY)
    return flagged
  } catch {
    return false
  }
}

/** The page someone asked for before signing in. Kept in localStorage: the emailed link opens a new tab. */
export function rememberReturnPath(path: string | null) {
  try {
    if (path) store('local')?.setItem(RETURN_KEY, path)
    else store('local')?.removeItem(RETURN_KEY)
  } catch {
    // Ignore: they land on their home page instead.
  }
}

export function peekReturnPath(): string | null {
  try {
    return store('local')?.getItem(RETURN_KEY) ?? null
  } catch {
    return null
  }
}

export function clearReturnPath() {
  rememberReturnPath(null)
}
