import type { SocialMetricImport } from '../data'
import { parseCsv } from './csv'
import { toMinor } from './money'

export const METRIC_COLUMNS = [
  'date',
  'platform',
  'followers',
  'reach',
  'impressions',
  'engagements',
  'profile_visits',
  'leads',
  'ad_spend',
] as const

export const METRICS_TEMPLATE = `${METRIC_COLUMNS.join(',')}\n2026-10-01,instagram,1200,5400,8100,310,95,4,1500`

const INTEGER_COLUMNS = ['followers', 'reach', 'impressions', 'engagements', 'profile_visits', 'leads'] as const
const squash = (value: string) => value.toLowerCase().replace(/[^a-z_]/g, '')

export type MetricsParse = { rows: SocialMetricImport[]; errors: string[] }

/**
 * Reads a daily-numbers CSV for one client. The first row names the columns; `ad_spend` is in rupees
 * and becomes paise. Every problem is reported with its line number, and nothing is imported if any exist.
 */
export function parseMetricsCsv(text: string, clientId: string): MetricsParse {
  const table = parseCsv(text)
  const header = (table[0] ?? []).map(squash)
  const errors: string[] = []
  const missing = ['date', 'platform'].filter((name) => !header.includes(name))
  if (missing.length > 0) return { rows: [], errors: [`The first row needs a "${missing.join('" and "')}" column.`] }

  const at = (cells: string[], name: string) => (cells[header.indexOf(name)] ?? '').trim()
  const rows: SocialMetricImport[] = []
  table.slice(1).forEach((cells, index) => {
    const line = index + 2
    const date = at(cells, 'date')
    const platform = at(cells, 'platform').toLowerCase()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      errors.push(`Line ${line}: date must look like 2026-10-01.`)
      return
    }
    if (!platform) {
      errors.push(`Line ${line}: platform is empty.`)
      return
    }
    const row: SocialMetricImport = {
      client_id: clientId,
      platform,
      date,
      followers: 0,
      reach: 0,
      impressions: 0,
      engagements: 0,
      profile_visits: 0,
      leads: 0,
      ad_spend_minor: 0,
    }
    for (const column of INTEGER_COLUMNS) {
      const raw = at(cells, column).replace(/,/g, '')
      if (raw === '') continue
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 0) {
        errors.push(`Line ${line}: ${column} must be a whole number.`)
        return
      }
      row[column] = value
    }
    const spend = at(cells, 'ad_spend')
    if (spend !== '') {
      const minor = toMinor(spend)
      if (Number.isNaN(minor) || minor < 0) {
        errors.push(`Line ${line}: ad_spend must be an amount in rupees.`)
        return
      }
      row.ad_spend_minor = minor
    }
    rows.push(row)
  })
  if (rows.length === 0 && errors.length === 0) errors.push('The file has no data rows.')
  return { rows, errors }
}
