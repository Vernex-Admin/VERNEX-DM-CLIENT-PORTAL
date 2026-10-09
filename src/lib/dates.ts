// Every date the client sees is in Indian Standard Time, whatever the browser's own zone is.
const TZ = 'Asia/Kolkata'

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
const shortDateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })

const DAY_MS = 86_400_000

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value))

/** The IST calendar day of an instant, as `YYYY-MM-DD`. A plain `YYYY-MM-DD` is returned as is. */
export function istDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return dayFormat.format(toDate(value))
}

/** Whole IST calendar days from `from` to `to`; negative when `to` is earlier. */
export function istDaysBetween(from: string | Date, to: string | Date): number {
  return Math.round((Date.parse(istDay(to)) - Date.parse(istDay(from))) / DAY_MS)
}

/** "9 Oct 2026". */
export function formatDate(value: string | Date): string {
  const day = istDay(value)
  return dateFormat.format(new Date(`${day}T00:00:00+05:30`))
}

/** "9 Oct". */
export function formatShortDate(value: string | Date): string {
  const day = istDay(value)
  return shortDateFormat.format(new Date(`${day}T00:00:00+05:30`))
}

/** "9 Oct 2026, 3:30 pm IST". */
export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)}, ${timeFormat.format(toDate(value)).toLowerCase()} IST`
}

/** "just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", then the date. Days are IST days. */
export function relativeTime(value: string | Date, now: Date = new Date()): string {
  const then = toDate(value)
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  const days = istDaysBetween(then, now)
  if (days === 0) return `${Math.floor(seconds / 3600)} h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(then)
}
