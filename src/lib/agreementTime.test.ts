import { describe, expect, it } from 'vitest'
import { currentIanaTimeZone, formatClientSignedAt } from './agreementTime'

describe('agreement client signing timezone', () => {
  it('formats the same server timestamp using the client timezone for every view', () => {
    const signedAt = '2026-10-21T11:00:00.000Z'
    const admin = formatClientSignedAt(signedAt, 'Asia/Kolkata')
    const client = formatClientSignedAt(signedAt, 'Asia/Kolkata')
    expect(admin).toBe(client)
    expect(admin).toContain('21 Oct 2026')
    expect(admin).toContain('Asia/Kolkata')
  })

  it('rejects invalid zones rather than showing a misleading local time', () => {
    expect(formatClientSignedAt('2026-10-21T11:00:00.000Z', 'Invalid/Zone')).toBe('Invalid client timezone')
    expect(formatClientSignedAt('2026-10-21T11:00:00.000Z', null)).toBe('Not signed')
  })

  it('returns an IANA timezone from the browser runtime', () => {
    expect(currentIanaTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})
