import { describe, expect, it } from 'vitest'
import { parseMetricsCsv } from '../../lib/metricsCsv'
import { MAX_UPLOAD_BYTES, OVER_LIMIT_MESSAGE, safeFileName, storagePath } from './storage'

describe('storage paths', () => {
  it('lowercases, turns spaces into dashes and strips everything else', () => {
    expect(safeFileName('My Logo (Final) v2.PNG')).toBe('my-logo-final-v2.png')
    expect(safeFileName('  ../../etc/passwd ')).toBe('etcpasswd')
    expect(safeFileName('???')).toBe('file')
  })

  it('builds clients/<client_id>/<folder>/<timestamp>-<name>', () => {
    expect(storagePath('c-1', 'brand_assets', 'Brand Kit.pdf', 1_700_000_000_000)).toBe(
      'clients/c-1/brand_assets/1700000000000-brand-kit.pdf',
    )
  })

  it('has a 50 MB limit with the Google Drive message', () => {
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024)
    expect(OVER_LIMIT_MESSAGE).toBe('Files over 50 MB go on Google Drive')
  })
})

describe('metrics CSV', () => {
  const header = 'date,platform,followers,reach,impressions,engagements,profile_visits,leads,ad_spend'

  it('reads rows and turns rupees into paise', () => {
    const { rows, errors } = parseMetricsCsv(`${header}\n2026-10-01,Instagram,1200,5400,8100,310,95,4,1500.50`, 'c-1')
    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        client_id: 'c-1',
        platform: 'instagram',
        date: '2026-10-01',
        followers: 1200,
        reach: 5400,
        impressions: 8100,
        engagements: 310,
        profile_visits: 95,
        leads: 4,
        ad_spend_minor: 150050,
      },
    ])
  })

  it('reports each bad line and imports nothing from a bad file', () => {
    const { errors } = parseMetricsCsv(`${header}\n10/01/2026,instagram,1,1,1,1,1,1,1\n2026-10-02,,1,1,1,1,1,1,1\n2026-10-03,facebook,-4,1,1,1,1,1,1`, 'c-1')
    expect(errors).toHaveLength(3)
    expect(errors[0]).toMatch(/Line 2/)
  })

  it('needs date and platform columns', () => {
    expect(parseMetricsCsv('reach\n5', 'c-1').errors[0]).toMatch(/date/)
  })
})
