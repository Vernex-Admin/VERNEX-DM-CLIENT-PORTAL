// Client Codes, login codes and passwords. The database assigns Client Codes; this file only reads
// and checks them so the browser, the mock and the Edge Function agree on the format.

/** VXC-1001: Vernex Client, then a number counting up from 1001. */
export const CLIENT_CODE_PREFIX = 'VXC-'
export const FIRST_CLIENT_NUMBER = 1001
export const CLIENT_CODE = /^VXC-\d{4,}$/
/** The client's own code, or the code plus -2, -3, ... for each further person. */
export const LOGIN_CODE = /^VXC-\d{4,}(-\d{1,3})?$/

export const clientCode = (n: number) => `${CLIENT_CODE_PREFIX}${n}`

/** The next Client Code after the ones already used. */
export function nextClientCode(used: Iterable<string>): string {
  let highest = FIRST_CLIENT_NUMBER - 1
  for (const code of used) {
    const n = Number(code.slice(CLIENT_CODE_PREFIX.length))
    if (CLIENT_CODE.test(code) && n > highest) highest = n
  }
  return clientCode(highest + 1)
}

/**
 * The login code for a person of a client: the first person with a login gets the Client Code
 * itself, everyone after that the code with a number.
 */
export function nextLoginCode(clientCodeValue: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(clientCodeValue)) return clientCodeValue
  for (let n = 2; ; n++) {
    const candidate = `${clientCodeValue}-${n}`
    if (!used.has(candidate)) return candidate
  }
}

/**
 * People added without an email still need one for Supabase Auth. This address is reserved
 * (.invalid can never receive mail) and is never shown as a contact email.
 */
export const LOGIN_ONLY_EMAIL_DOMAIN = 'clients.vernex.invalid'
export const loginOnlyEmail = (loginCode: string) => `${loginCode.toLowerCase()}@${LOGIN_ONLY_EMAIL_DOMAIN}`
export const isLoginOnlyEmail = (email: string) => email.toLowerCase().endsWith(`@${LOGIN_ONLY_EMAIL_DOMAIN}`)

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

/** Why a password cannot be used, or undefined. */
export function passwordError(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  if (/\s/.test(password)) return 'Leave out spaces.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.'
  return undefined
}

// No 0/O, 1/l/I: the password is often read out over the phone.
const LOWER = 'abcdefghjkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const DIGITS = '23456789'

function pick(alphabet: string, count: number): string {
  const bytes = new Uint32Array(count)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

/** An easy-to-read password such as "Kmtr-8452-vaqe": letters, digits and an upper-case letter. */
export function generatePassword(): string {
  const first = pick(UPPER, 1) + pick(LOWER, 3)
  return `${first}-${pick(DIGITS, 4)}-${pick(LOWER, 4)}`
}
