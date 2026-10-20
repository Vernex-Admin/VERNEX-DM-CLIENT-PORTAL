import { describe, expect, it } from 'vitest'
import { NOT_INVITED_MESSAGE, isNotInvited, signInErrorMessage } from '../../lib/authMessages'
import { DataError } from '../types'
import { cleanPatch, toDataError } from './errors'

describe('toDataError', () => {
  it('shows our own function errors (P0001) as they are', () => {
    const error = toDataError({ code: 'P0001', message: 'No revisions are left on this deliverable.' })
    expect(error).toBeInstanceOf(DataError)
    expect(error).toMatchObject({ code: 'invalid', message: 'No revisions are left on this deliverable.' })
  })

  it('maps 42501 and row-level security to forbidden', () => {
    expect(toDataError({ code: '42501', message: 'x' }).code).toBe('forbidden')
    expect(
      toDataError({ code: '', message: 'new row violates row-level security policy for table "projects"' }).code,
    ).toBe('forbidden')
  })

  it('maps no rows on .single() to not_found', () => {
    expect(toDataError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }).code).toBe(
      'not_found',
    )
  })

  it('never shows raw Postgres text otherwise', () => {
    const error = toDataError({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_email_key"' })
    expect(error.message).not.toMatch(/duplicate key|constraint/)
    expect(toDataError({ code: 'XX000', message: 'internal pg detail' }).message).toBe('Something went wrong. Try again.')
  })

  it('uses a per-call message for a code', () => {
    const error = toDataError({ code: '23505', message: 'dup' }, { '23505': 'Someone already uses that email address.' })
    expect(error.message).toBe('Someone already uses that email address.')
  })
})

describe('cleanPatch', () => {
  it('never sends the id, the tenant key or the clock', () => {
    expect(cleanPatch({ id: '1', client_id: 'c', created_at: 'x', name: 'New', city: undefined })).toEqual({ name: 'New' })
  })
})

describe('invite-only sign-in messages', () => {
  it('rewords the database refusal for people', () => {
    expect(isNotInvited('Database error saving new user')).toBe(true)
    expect(signInErrorMessage('Database error saving new user')).toBe(NOT_INVITED_MESSAGE)
  })

  it('passes other messages, such as a rate limit, through plainly', () => {
    const message = 'For security purposes, you can only request this after 52 seconds.'
    expect(signInErrorMessage(message)).toBe(message)
  })
})
