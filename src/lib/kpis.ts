import type { Minor, SocialMetricDaily } from '../types/db'

export type KpiId = 'reach' | 'leads' | 'cost_per_lead' | 'ad_spend'

export type Kpi = {
  id: KpiId
  label: string
  /** Reach and leads are counts, the other two are money in paise. */
  unit: 'count' | 'money'
  value: number
  /** Fractional change against the previous period (0.1 is +10%); null when there is nothing to compare. */
  change: number | null
  /** Whether a rise is good news. A rise in a cost is bad. */
  goodWhen: 'up' | 'down'
}

type Totals = { reach: number; leads: number; spend: Minor }

const totalsOf = (rows: SocialMetricDaily[]): Totals =>
  rows.reduce(
    (sum, row) => ({ reach: sum.reach + row.reach, leads: sum.leads + row.leads, spend: sum.spend + row.ad_spend_minor }),
    { reach: 0, leads: 0, spend: 0 },
  )

const costPerLead = (totals: Totals) => (totals.leads > 0 ? Math.round(totals.spend / totals.leads) : 0)

const change = (now: number, before: number) => (before > 0 ? (now - before) / before : null)

/** Rows of two equal periods, oldest first: the later half against the earlier half. */
export function summariseKpis(rows: SocialMetricDaily[]): Kpi[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const half = Math.floor(sorted.length / 2)
  const current = totalsOf(sorted.slice(sorted.length - half))
  const previous = totalsOf(sorted.slice(0, half))
  const hasPrevious = half > 0

  const cpl = costPerLead(current)
  const previousCpl = costPerLead(previous)

  return [
    { id: 'reach', label: 'Reach', unit: 'count', value: current.reach, change: hasPrevious ? change(current.reach, previous.reach) : null, goodWhen: 'up' },
    { id: 'leads', label: 'Leads', unit: 'count', value: current.leads, change: hasPrevious ? change(current.leads, previous.leads) : null, goodWhen: 'up' },
    { id: 'cost_per_lead', label: 'Cost per lead', unit: 'money', value: cpl, change: hasPrevious && previousCpl > 0 ? change(cpl, previousCpl) : null, goodWhen: 'down' },
    { id: 'ad_spend', label: 'Ad spend', unit: 'money', value: current.spend, change: hasPrevious ? change(current.spend, previous.spend) : null, goodWhen: 'down' },
  ]
}

/** 'good', 'bad' or 'flat' for a change, taking the direction that counts as good into account. */
export function changeTone(kpi: Pick<Kpi, 'change' | 'goodWhen'>): 'good' | 'bad' | 'flat' {
  if (kpi.change === null || Math.abs(kpi.change) < 0.005) return 'flat'
  const rose = kpi.change > 0
  return rose === (kpi.goodWhen === 'up') ? 'good' : 'bad'
}
