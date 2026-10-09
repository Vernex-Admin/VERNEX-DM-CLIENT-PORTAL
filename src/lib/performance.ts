import type { Minor, SocialMetricDaily } from '../types/db'

export const RANGES = [7, 30, 90] as const
export type Range = (typeof RANGES)[number]

export type PerformanceKpiId =
  | 'reach'
  | 'views'
  | 'engagement'
  | 'followers_gained'
  | 'ad_spend'
  | 'leads'
  | 'cost_per_lead'

export type PerformanceKpi = {
  id: PerformanceKpiId
  label: string
  unit: 'count' | 'money'
  value: number
  /** Fractional change against the period before; null when that period has no data. */
  change: number | null
  /** Whether a rise is good news. A rise in a cost is bad. */
  goodWhen: 'up' | 'down'
}

export type DayPoint = {
  date: string
  reach: number
  views: number
  engagements: number
  followers: number
  leads: number
  spend: Minor
}

/** Rows of every platform folded into one point per day, oldest first. */
export function byDay(rows: SocialMetricDaily[]): DayPoint[] {
  const days = new Map<string, DayPoint>()
  for (const row of rows) {
    const point = days.get(row.date) ?? {
      date: row.date,
      reach: 0,
      views: 0,
      engagements: 0,
      followers: 0,
      leads: 0,
      spend: 0,
    }
    point.reach += row.reach
    point.views += row.impressions
    point.engagements += row.engagements
    point.followers += row.followers
    point.leads += row.leads
    point.spend += row.ad_spend_minor
    days.set(row.date, point)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

type Totals = { reach: number; views: number; engagements: number; gained: number; leads: number; spend: Minor }

function totalsOf(points: DayPoint[]): Totals {
  const sum = points.reduce(
    (total, point) => ({
      ...total,
      reach: total.reach + point.reach,
      views: total.views + point.views,
      engagements: total.engagements + point.engagements,
      leads: total.leads + point.leads,
      spend: total.spend + point.spend,
    }),
    { reach: 0, views: 0, engagements: 0, gained: 0, leads: 0, spend: 0 },
  )
  // Followers is a running total, so the gain is the last day against the first.
  const first = points[0]
  const last = points[points.length - 1]
  return { ...sum, gained: first && last ? last.followers - first.followers : 0 }
}

const costPerLead = (totals: Totals) => (totals.leads > 0 ? Math.round(totals.spend / totals.leads) : 0)
const change = (now: number, before: number) => (before > 0 ? (now - before) / before : null)

/**
 * The seven KPI cards for the last `days` days of `rows`, each compared with the `days` before
 * them. Pass up to twice the range; a comparison needs data on both sides.
 */
export function performanceKpis(rows: SocialMetricDaily[], days: number): PerformanceKpi[] {
  const points = byDay(rows)
  const latest = points[points.length - 1]
  const current = points.slice(-days)
  const earlier = latest ? points.slice(0, Math.max(0, points.length - days)).slice(-days) : []
  const hasEarlier = earlier.length > 0

  const now = totalsOf(current)
  const before = totalsOf(earlier)
  const cpl = costPerLead(now)
  const beforeCpl = costPerLead(before)

  const kpi = (
    id: PerformanceKpiId,
    label: string,
    unit: PerformanceKpi['unit'],
    value: number,
    previous: number,
    goodWhen: PerformanceKpi['goodWhen'],
  ): PerformanceKpi => ({ id, label, unit, value, change: hasEarlier ? change(value, previous) : null, goodWhen })

  return [
    kpi('reach', 'Reach', 'count', now.reach, before.reach, 'up'),
    kpi('views', 'Views', 'count', now.views, before.views, 'up'),
    kpi('engagement', 'Engagement', 'count', now.engagements, before.engagements, 'up'),
    kpi('followers_gained', 'Followers gained', 'count', now.gained, before.gained, 'up'),
    kpi('ad_spend', 'Ad spend', 'money', now.spend, before.spend, 'down'),
    kpi('leads', 'Leads', 'count', now.leads, before.leads, 'up'),
    kpi('cost_per_lead', 'Cost per lead', 'money', cpl, beforeCpl, 'down'),
  ]
}

/** The points inside the range, for the chart. */
export function chartPoints(rows: SocialMetricDaily[], days: number): DayPoint[] {
  return byDay(rows).slice(-days)
}
