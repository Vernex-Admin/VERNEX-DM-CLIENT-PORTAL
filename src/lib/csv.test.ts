import { describe, expect, it } from 'vitest'
import { guessMapping, parseCsv, rowsToLeads } from './csv'
import { isOverdue } from './leads'

describe('parseCsv', () => {
  it('handles quotes, embedded commas and newlines, doubled quotes and CRLF', () => {
    const text = 'Company,Notes\r\n"Acme, Inc","Says ""hi""\nand leaves"\r\n\r\nBeta,plain'
    expect(parseCsv(text)).toEqual([
      ['Company', 'Notes'],
      ['Acme, Inc', 'Says "hi"\nand leaves'],
      ['Beta', 'plain'],
    ])
  })
})

describe('lead import', () => {
  it('guesses the mapping from header names, one column per field', () => {
    const mapping = guessMapping(['Business', 'City', 'Mobile', 'Monthly Budget', 'Company', 'Mystery'])
    expect(mapping).toEqual({ 0: 'company', 1: 'city', 2: 'phone_e164', 3: 'monthly_budget_minor', 4: '', 5: '' })
  })

  it('converts values and reports rows without a company', () => {
    const rows = [
      ['Nila Interiors', '98765 43210', '25,000', 'a', '88', '2026-11-02', 'Proposal'],
      ['', 'x', '', '', '', '', ''],
      ['Bad Values', '', 'lots', 'Z', '400', '02/11/2026', 'Nowhere'],
    ]
    const { leads, skipped } = rowsToLeads(rows, {
      0: 'company', 1: 'phone_e164', 2: 'monthly_budget_minor', 3: 'tier', 4: 'score', 5: 'follow_up_date', 6: 'stage',
    })
    expect(leads[0]).toEqual({
      company: 'Nila Interiors', phone_e164: '+919876543210', monthly_budget_minor: 2_500_000, tier: 'A', score: 88, follow_up_date: '2026-11-02', stage: 'proposal',
    })
    // Values that do not fit are left out rather than guessed.
    expect(leads[1]).toEqual({ company: 'Bad Values' })
    expect(skipped).toEqual([{ row: 3, reason: 'No company' }])
  })
})

describe('isOverdue', () => {
  const now = new Date('2026-10-09T10:00:00Z')
  it('is true only for a past follow-up on an open lead', () => {
    expect(isOverdue({ follow_up_date: '2026-10-08', stage: 'qualified' }, now)).toBe(true)
    expect(isOverdue({ follow_up_date: '2026-10-09', stage: 'qualified' }, now)).toBe(false)
    expect(isOverdue({ follow_up_date: '2026-10-01', stage: 'closed_won' }, now)).toBe(false)
    expect(isOverdue({ follow_up_date: null, stage: 'qualified' }, now)).toBe(false)
  })
})
