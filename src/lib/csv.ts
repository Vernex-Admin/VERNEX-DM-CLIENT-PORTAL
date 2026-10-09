import type { LeadInsert } from '../data'
import { LEAD_STAGES, LEAD_TIERS } from '../types/db'
import { STAGE_LABEL } from './leads'
import { toMinor } from './money'

/** Parses CSV text: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else field += char
  }
  row.push(field)
  rows.push(row)
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

/** The lead columns a CSV column can be mapped to. */
export const LEAD_FIELDS = [
  { key: 'company', label: 'Company' },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'City' },
  { key: 'industry', label: 'Industry' },
  { key: 'website', label: 'Website' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'decision_maker', label: 'Decision Maker' },
  { key: 'role', label: 'Role' },
  { key: 'email', label: 'Email' },
  { key: 'phone_e164', label: 'Phone' },
  { key: 'score', label: 'Score' },
  { key: 'tier', label: 'Tier' },
  { key: 'problem', label: 'Problem' },
  { key: 'opportunity', label: 'Opportunity' },
  { key: 'recommended_offer', label: 'Recommended Offer' },
  { key: 'monthly_budget_minor', label: 'Estimated Monthly Budget (₹)' },
  { key: 'next_action', label: 'Next Action' },
  { key: 'follow_up_date', label: 'Follow-up Date' },
  { key: 'notes', label: 'Notes' },
  { key: 'stage', label: 'Stage' },
] as const

export type LeadFieldKey = (typeof LEAD_FIELDS)[number]['key']
/** CSV column index to the lead field it feeds; '' leaves the column out. */
export type ColumnMapping = Record<number, LeadFieldKey | ''>

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const ALIASES: Record<string, LeadFieldKey> = {
  companyname: 'company',
  business: 'company',
  name: 'company',
  contact: 'decision_maker',
  contactname: 'decision_maker',
  title: 'role',
  phonenumber: 'phone_e164',
  mobile: 'phone_e164',
  whatsapp: 'phone_e164',
  budget: 'monthly_budget_minor',
  monthlybudget: 'monthly_budget_minor',
  estimatedmonthlybudget: 'monthly_budget_minor',
  followup: 'follow_up_date',
  followupdate: 'follow_up_date',
  site: 'website',
  ig: 'instagram',
}

/** A first guess at the mapping from the header row, by matching names. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const taken = new Set<string>()
  headers.forEach((header, index) => {
    const key = squash(header)
    const field = LEAD_FIELDS.find((candidate) => squash(candidate.label) === key || candidate.key.replaceAll('_', '') === key)?.key ?? ALIASES[key]
    // A field takes one column; the first match wins.
    if (field && !taken.has(field)) {
      mapping[index] = field
      taken.add(field)
    } else mapping[index] = ''
  })
  return mapping
}

function phoneOf(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, '')
  if (!digits) return null
  if (digits.startsWith('+')) return digits
  return `+91${digits.replace(/^0+/, '')}`
}

export type ImportResult = { leads: LeadInsert[]; skipped: { row: number; reason: string }[] }

/** Turns data rows (header excluded) into leads using `mapping`. A row without a company is skipped and reported. */
export function rowsToLeads(rows: string[][], mapping: ColumnMapping): ImportResult {
  const leads: LeadInsert[] = []
  const skipped: ImportResult['skipped'] = []

  rows.forEach((cells, index) => {
    const lead: Record<string, unknown> = {}
    for (const [column, field] of Object.entries(mapping)) {
      const raw = (cells[Number(column)] ?? '').trim()
      if (!field || !raw) continue
      if (field === 'score') {
        const score = Number(raw)
        if (Number.isFinite(score) && score >= 0 && score <= 100) lead.score = Math.round(score)
      } else if (field === 'tier') {
        const tier = raw.toUpperCase()
        if ((LEAD_TIERS as readonly string[]).includes(tier)) lead.tier = tier
      } else if (field === 'monthly_budget_minor') {
        const minor = toMinor(raw)
        if (!Number.isNaN(minor) && minor >= 0) lead.monthly_budget_minor = minor
      } else if (field === 'phone_e164') lead.phone_e164 = phoneOf(raw)
      else if (field === 'follow_up_date') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) lead.follow_up_date = raw
      } else if (field === 'stage') {
        const wanted = squash(raw)
        const stage = LEAD_STAGES.find((candidate) => squash(STAGE_LABEL[candidate]) === wanted || squash(candidate) === wanted)
        if (stage) lead.stage = stage
      } else lead[field] = raw
    }
    if (typeof lead.company !== 'string' || !lead.company) skipped.push({ row: index + 2, reason: 'No company' })
    else leads.push(lead as LeadInsert)
  })
  return { leads, skipped }
}
