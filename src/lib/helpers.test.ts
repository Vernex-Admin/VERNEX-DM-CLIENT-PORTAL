import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/mock/seed'
import { revisionTone } from '../components/RevisionMeter'
import { ctaFor, dueLabel, sortActionItems } from './actionItems'
import { telLink, whatsappLink } from './contact'
import { formatDate, formatDateTime, istDay, istDaysBetween, relativeTime } from './dates'
import { changeTone, summariseKpis } from './kpis'
import { milestonePercent } from './progress'
import type { ActionItem, SocialMetricDaily } from '../types/db'

describe('IST dates', () => {
  it('uses the Indian calendar day, not the UTC one', () => {
    // 19:00 UTC on 9 Oct is 00:30 on 10 Oct in India.
    expect(istDay('2026-10-09T19:00:00Z')).toBe('2026-10-10')
    expect(formatDate('2026-10-09T19:00:00Z')).toBe('10 Oct 2026')
    expect(formatDateTime('2026-10-09T19:00:00Z')).toBe('10 Oct 2026, 12:30 am IST')
  })

  it('counts whole IST days', () => {
    expect(istDaysBetween('2026-10-09T18:00:00Z', '2026-10-09T19:00:00Z')).toBe(1)
    expect(istDaysBetween('2026-10-01', '2026-10-04')).toBe(3)
  })

  it('writes relative times', () => {
    const now = new Date('2026-10-09T10:00:00Z')
    expect(relativeTime('2026-10-09T09:59:30Z', now)).toBe('just now')
    expect(relativeTime('2026-10-09T09:48:00Z', now)).toBe('12 min ago')
    expect(relativeTime('2026-10-09T07:00:00Z', now)).toBe('3 h ago')
    expect(relativeTime('2026-10-08T08:00:00Z', now)).toBe('Yesterday')
    expect(relativeTime('2026-10-05T08:00:00Z', now)).toBe('4 days ago')
    expect(relativeTime('2026-09-01T08:00:00Z', now)).toBe('1 Sept 2026')
  })
})

describe('WhatsApp and call links', () => {
  it('prefills the message', () => {
    const link = whatsappLink({
      phoneE164: '+919000000002',
      lead: 'Karthik',
      user: 'Arun Kumar',
      client: 'AGK Fitness',
      project: 'Monthly social media',
    })
    expect(link.startsWith('https://wa.me/919000000002?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1] as string)).toBe(
      'Hi Karthik, this is Arun Kumar from AGK Fitness about Monthly social media',
    )
  })

  it('builds a tel link', () => {
    expect(telLink('+91 90000 00002')).toBe('tel:+919000000002')
  })
})

describe('KPIs', () => {
  const day = (n: number, over: Partial<SocialMetricDaily>): SocialMetricDaily => ({
    client_id: 'c',
    project_id: null,
    platform: 'instagram',
    date: `2026-10-${String(n).padStart(2, '0')}`,
    followers: 0,
    reach: 100,
    impressions: 0,
    engagements: 0,
    profile_visits: 0,
    leads: 2,
    ad_spend_minor: 20_000,
    ...over,
  })

  it('compares the later half with the earlier half', () => {
    const rows = [day(1, {}), day(2, {}), day(3, { reach: 150, leads: 1, ad_spend_minor: 30_000 }), day(4, { reach: 150, leads: 1, ad_spend_minor: 30_000 })]
    const kpis = Object.fromEntries(summariseKpis(rows).map((kpi) => [kpi.id, kpi]))
    expect(kpis.reach?.value).toBe(300)
    expect(kpis.reach?.change).toBeCloseTo(0.5)
    expect(kpis.cost_per_lead?.value).toBe(30_000)
    expect(kpis.cost_per_lead?.change).toBeCloseTo(2) // 10,000 a lead before, 30,000 after
  })

  it('shows a rise in a cost as bad and a rise in reach as good', () => {
    expect(changeTone({ change: 0.2, goodWhen: 'down' })).toBe('bad')
    expect(changeTone({ change: -0.2, goodWhen: 'down' })).toBe('good')
    expect(changeTone({ change: 0.2, goodWhen: 'up' })).toBe('good')
    expect(changeTone({ change: null, goodWhen: 'up' })).toBe('flat')
  })

  it('has numbers for the seeded clients', () => {
    const rows = createSeed().social_metrics_daily.filter((row) => row.client_id === 'c-agk')
    const kpis = summariseKpis(rows)
    expect(kpis.map((kpi) => kpi.id)).toEqual(['reach', 'leads', 'cost_per_lead', 'ad_spend'])
    expect(kpis.every((kpi) => kpi.value > 0)).toBe(true)
  })
})

describe('action items', () => {
  const item = (id: string, over: Partial<ActionItem>): ActionItem => ({
    id,
    client_id: 'c',
    project_id: null,
    type: 'approval',
    title: id,
    ref_type: null,
    ref_id: null,
    assigned_user_id: null,
    blocks_milestone: false,
    due_at: '2026-10-12T00:00:00Z',
    resolved_at: null,
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  })
  const now = new Date('2026-10-09T10:00:00Z')

  it('sorts overdue first, then blocking, then by due date', () => {
    const sorted = sortActionItems(
      [
        item('later', { due_at: '2026-10-20T00:00:00Z' }),
        item('blocking', { blocks_milestone: true, due_at: '2026-10-15T00:00:00Z' }),
        item('overdue', { due_at: '2026-10-05T00:00:00Z' }),
        item('soon', { due_at: '2026-10-10T00:00:00Z' }),
      ],
      now,
    )
    expect(sorted.map((row) => row.id)).toEqual(['overdue', 'blocking', 'soon', 'later'])
  })

  it('gives one button per type', () => {
    expect(ctaFor(item('a', { type: 'approval', ref_id: 'd1' }))).toEqual({ label: 'Review', to: '/deliverables/d1' })
    expect(ctaFor(item('a', { type: 'missing_asset' })).label).toBe('Upload')
    expect(ctaFor(item('a', { type: 'invoice_due' })).label).toBe('Pay')
  })

  it('words the due date', () => {
    expect(dueLabel(item('a', { due_at: '2026-10-06T00:00:00Z' }), now)).toBe('Overdue by 3 days')
    expect(dueLabel(item('a', { due_at: '2026-10-09T00:00:00Z' }), now)).toBe('Due today')
    expect(dueLabel(item('a', { due_at: '2026-10-10T00:00:00Z' }), now)).toBe('Due tomorrow')
  })
})

describe('milestone percent and revision meter', () => {
  it('uses the approved share of a milestone\u2019s deliverables', () => {
    const seed = createSeed()
    const milestones = seed.milestones.filter((row) => row.project_id === 'p-agk-social')
    const percent = milestonePercent(milestones, seed.deliverables)
    expect(percent['m-agk-social-1']).toBe(100)
    // One of its five deliverables (the Navratri carousel) is approved.
    expect(percent['m-agk-social-2']).toBe(20)
  })

  it('goes neutral, amber, then red', () => {
    expect(revisionTone(0, 3)).toBe('neutral')
    expect(revisionTone(1, 3)).toBe('neutral')
    expect(revisionTone(2, 3)).toBe('warn')
    expect(revisionTone(3, 3)).toBe('bad')
    expect(revisionTone(1, 2)).toBe('neutral')
    expect(revisionTone(2, 2)).toBe('bad')
  })
})

