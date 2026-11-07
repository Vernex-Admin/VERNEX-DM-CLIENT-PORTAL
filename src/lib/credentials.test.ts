import { describe, expect, it } from 'vitest'
import { STANDARD_DETAIL_FIELDS, detailsStatus, fieldsError, newFieldKey, validateDetails } from './clientDetails'
import {
  CLIENT_CODE,
  LOGIN_CODE,
  generatePassword,
  isLoginOnlyEmail,
  loginOnlyEmail,
  nextClientCode,
  nextLoginCode,
  passwordError,
} from './credentials'

describe('codes', () => {
  it('starts at VXC-1001 and counts up from the highest used', () => {
    expect(nextClientCode([])).toBe('VXC-1001')
    expect(nextClientCode(['VXC-1001', 'VXC-1007', 'junk'])).toBe('VXC-1008')
  })

  it('gives the first person the Client Code and the next ones a number', () => {
    expect(nextLoginCode('VXC-1001', [])).toBe('VXC-1001')
    expect(nextLoginCode('VXC-1001', ['VXC-1001', 'VXC-1001-2'])).toBe('VXC-1001-3')
  })

  it('accepts only well-formed codes', () => {
    expect(CLIENT_CODE.test('VXC-1001')).toBe(true)
    expect(CLIENT_CODE.test('VXC-1001-2')).toBe(false)
    expect(LOGIN_CODE.test('VXC-1001-2')).toBe(true)
    expect(LOGIN_CODE.test('CL-1001')).toBe(false)
  })

  it('makes login-only emails that are recognisable', () => {
    expect(loginOnlyEmail('VXC-1001')).toBe('vxc-1001@clients.vernex.invalid')
    expect(isLoginOnlyEmail('VXC-1001@CLIENTS.VERNEX.INVALID')).toBe(true)
    expect(isLoginOnlyEmail('arun@agk.example')).toBe(false)
  })
})

describe('passwords', () => {
  it('needs 8 or more characters with letters and numbers, and no spaces', () => {
    expect(passwordError('short1')).toBeTruthy()
    expect(passwordError('lettersonly')).toBeTruthy()
    expect(passwordError('12345678')).toBeTruthy()
    expect(passwordError('has space1')).toBeTruthy()
    expect(passwordError('Good-pass-1')).toBeUndefined()
  })

  it('generates passwords that pass its own rules, and differ', () => {
    const made = Array.from({ length: 50 }, generatePassword)
    for (const password of made) expect(passwordError(password)).toBeUndefined()
    expect(new Set(made).size).toBe(made.length)
  })
})

describe('client details', () => {
  it('works out the status', () => {
    const base = { details: null, details_submitted_at: null, details_locked_at: null }
    expect(detailsStatus(base)).toBe('not_started')
    expect(detailsStatus({ ...base, details: { city: 'Chennai' } })).toBe('in_progress')
    expect(detailsStatus({ ...base, details_submitted_at: 'x' })).toBe('submitted')
    expect(detailsStatus({ ...base, details_submitted_at: 'x', details_locked_at: 'y' })).toBe('locked')
  })

  it('requires answers only when submitting, and always checks formats', () => {
    const fields = [...STANDARD_DETAIL_FIELDS]
    expect(validateDetails(fields, {}, false)).toEqual({})
    expect(Object.keys(validateDetails(fields, {}, true))).toContain('legal_name')
    expect(validateDetails(fields, { pincode: '1234' }, false).pincode).toBeTruthy()
    expect(validateDetails(fields, { gstin: '33AAAAA0000A1Z5', website: 'agk.example' }, false)).toEqual({})
  })

  it('checks a custom form and makes unique keys', () => {
    expect(newFieldKey('Shoot days!', [])).toBe('custom_shoot_days')
    expect(newFieldKey('Shoot days', ['custom_shoot_days'])).toBe('custom_shoot_days_2')
    expect(fieldsError([])).toBeTruthy()
    const one = { key: 'a', label: 'A', type: 'text' as const, required: false, section: '', hint: null }
    expect(fieldsError([one, one])).toBeTruthy()
    expect(fieldsError([one])).toBeUndefined()
  })
})
