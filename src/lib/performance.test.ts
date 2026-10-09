import { describe, expect, it } from 'vitest'
import { brandChecklist, checklistPercent } from './brandChecklist'
import { performanceKpis } from './performance'
import type { SocialMetricDaily } from '../types/db'

const row = (n: number, over: Partial<SocialMetricDaily> = {}): SocialMetricDaily => ({
  client_id: 'c',
  project_id: null,
  platform: 'instagram',
  date: `2026-09-${String(n).padStart(2, '0')}`,
  followers: 1000 + n,
  reach: 100,
  impressions: 200,
  engagements: 10,
  profile_visits: 5,
  leads: 2,
  ad_spend_minor: 50_000,
  ...over,
})

describe('performanceKpis', () => {
  it('sums the range, gains followers last-vs-first and divides spend by leads', () => {
    const kpis = performanceKpis([row(1), row(2), row(3)], 3)
    const by = Object.fromEntries(kpis.map((k) => [k.id, k]))
    expect(kpis.map((k) => k.label)).toEqual([
      'Reach',
      'Views',
      'Engagement',
      'Followers gained',
      'Ad spend',
      'Leads',
      'Cost per lead',
    ])
    expect(by.reach?.value).toBe(300)
    expect(by.views?.value).toBe(600)
    expect(by.followers_gained?.value).toBe(2)
    expect(by.ad_spend?.value).toBe(150_000)
    expect(by.cost_per_lead?.value).toBe(25_000)
    // Nothing earlier to compare with.
    expect(by.reach?.change).toBeNull()
  })

  it('compares with the days before and folds platforms into one day', () => {
    const rows = [row(1, { reach: 100 }), row(2, { reach: 100 }), row(3, { reach: 150 }), row(3, { platform: 'facebook', reach: 150 }), row(4, { reach: 150 })]
    const reach = performanceKpis(rows, 2).find((k) => k.id === 'reach')
    // Days 3-4 are 300 + 150 = 450, days 1-2 are 200.
    expect(reach?.value).toBe(450)
    expect(reach?.change).toBeCloseTo(1.25)
  })

  it('has zero cost per lead without leads', () => {
    const cpl = performanceKpis([row(1, { leads: 0 })], 7).find((k) => k.id === 'cost_per_lead')
    expect(cpl?.value).toBe(0)
  })
})

describe('brandChecklist', () => {
  it('scores logo, colours, fonts and five photos', () => {
    expect(checklistPercent(brandChecklist([]))).toBe(0)
    const files = [{ name: 'logo.svg' }, { name: 'brand-colours.pdf' }]
    expect(checklistPercent(brandChecklist(files))).toBe(50)
    const full = [
      ...files,
      { name: 'fonts.zip' },
      ...[1, 2, 3, 4, 5].map((n) => ({ name: `product-${n}.jpg` })),
    ]
    expect(checklistPercent(brandChecklist(full))).toBe(100)
    expect(brandChecklist(files).find((i) => i.id === 'photos')?.detail).toBe('0 of 5')
  })
})
