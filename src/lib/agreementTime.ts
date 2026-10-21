export function formatClientSignedAt(value: string | null, timeZone: string | null) {
  if (!value || !timeZone) return 'Not signed'
  try {
    const formatted = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone,
      timeZoneName: 'short',
    }).format(new Date(value))
    return `${formatted} (${timeZone})`
  } catch {
    return 'Invalid client timezone'
  }
}

export function currentIanaTimeZone() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!timeZone) throw new Error('Your browser timezone could not be determined. Update your device settings and try again.')
  try {
    new Intl.DateTimeFormat('en', { timeZone })
  } catch {
    throw new Error('Your browser reported an invalid timezone. Update your device settings and try again.')
  }
  return timeZone
}
