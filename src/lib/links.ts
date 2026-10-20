/**
 * A link a person typed or a staff member pasted is only ever opened if it is a web address
 * (or a local blob from the in-memory mock). Anything else, such as `javascript:`, is dropped.
 */
export function isSafeLink(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:' || protocol === 'blob:'
  } catch {
    return false
  }
}

/** Stricter, for what is stored: a web address only. */
export function isWebLink(value: string): boolean {
  try {
    const { protocol } = new URL(value.trim())
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
