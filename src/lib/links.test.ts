import { describe, expect, it } from 'vitest'
import { DataError } from '../data/types'
import { webLink } from '../data/supabase/errors'
import { isSafeLink, isWebLink } from './links'

describe('links', () => {
  it('opens only web addresses and local blobs', () => {
    expect(isSafeLink('https://drive.google.com/file/d/abc/view')).toBe(true)
    expect(isSafeLink('blob:http://localhost/1234')).toBe(true)
    expect(isSafeLink('javascript:alert(1)')).toBe(false)
    expect(isSafeLink('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeLink('not a url')).toBe(false)
    expect(isSafeLink(null)).toBe(false)
  })

  it('stores only web addresses', () => {
    expect(isWebLink('https://example.com/x')).toBe(true)
    expect(isWebLink('blob:http://localhost/1')).toBe(false)
    expect(webLink('  https://example.com/a ')).toBe('https://example.com/a')
    expect(webLink('')).toBeNull()
    expect(() => webLink('javascript:alert(1)')).toThrow(DataError)
  })
})
