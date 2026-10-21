import { describe, expect, it } from 'vitest'
import { baselineOffset, containBox, faceOf, parseColor } from './invoicePdfExport'
import { MM, PAGE_CONTENT_HEIGHT, planPages } from './invoicePagination'
import type { BlockHeights, PagePlan } from './invoicePagination'

// Measured from the real layout in Chrome: letterhead ~ 95mm, table header ~ 12mm, single-line
// row ~ 6.8mm, closing block ~ 62mm.
const heights = (rows: number[], patch: Partial<BlockHeights> = {}): BlockHeights => ({
  top: 95 * MM,
  continued: 12 * MM,
  tableHead: 12 * MM,
  rows,
  closing: 62 * MM,
  ...patch,
})
const row = 6.8 * MM

/** Every row appears exactly once, in order, and only the last page closes the invoice. */
function expectWellFormed(plan: PagePlan[], count: number) {
  const covered = plan.flatMap((page) => Array.from({ length: page.rows[1] - page.rows[0] }, (_, i) => page.rows[0] + i))
  expect(covered).toEqual(Array.from({ length: count }, (_, i) => i))
  expect(plan.filter((page) => page.closing)).toHaveLength(1)
  expect(plan.at(-1)?.closing).toBe(true)
  expect(plan[0]?.first).toBe(true)
  expect(plan.slice(1).every((page) => !page.first)).toBe(true)
}

describe('planPages', () => {
  it('keeps the standard 12-row invoice on one A4 page', () => {
    const plan = planPages(heights(Array(12).fill(row)))
    expect(plan).toEqual([{ first: true, rows: [0, 12], table: true, closing: true }])
  })

  it.each([2, 4, 13, 40, 120])('splits %i rows across pages without losing or repeating any', (count) => {
    const plan = planPages(heights(Array(count).fill(row)))
    expectWellFormed(plan, count)
    // Every page with rows repeats the table header.
    expect(plan.filter((page) => page.rows[1] > page.rows[0]).every((page) => page.table)).toBe(true)
    // Nothing is shrunk: each page holds at most what fits at full size.
    for (const page of plan) {
      const used =
        (page.first ? 95 : 12) * MM +
        (page.table ? 12 * MM : 0) +
        (page.rows[1] - page.rows[0]) * row +
        (page.closing ? 62 * MM : 0)
      expect(used).toBeLessThanOrEqual(PAGE_CONTENT_HEIGHT)
    }
  })

  it('moves the totals and footer to a new page together when they do not fit', () => {
    // Rows that fill page 1 almost exactly.
    const fill = Math.floor((PAGE_CONTENT_HEIGHT - 95 * MM - 12 * MM - 10) / row)
    const plan = planPages(heights(Array(fill).fill(row)))
    expect(plan).toHaveLength(2)
    expect(plan[0]).toMatchObject({ rows: [0, fill], closing: false })
    expect(plan[1]).toEqual({ first: false, rows: [fill, fill], table: false, closing: true })
  })

  it('starts the table on page 2 rather than leaving a bare header under a tall letterhead', () => {
    const plan = planPages(heights([200 * MM], { top: 160 * MM }))
    expect(plan[0]).toEqual({ first: true, rows: [0, 0], table: false, closing: false })
    expect(plan[1]).toMatchObject({ rows: [0, 1], table: true })
    expectWellFormed(plan, 1)
  })

  it('handles long multi-line rows and an invoice with no rows', () => {
    const tall = 120 * MM
    expectWellFormed(planPages(heights([row, tall, tall, row, tall])), 5)
    expect(planPages(heights([]))).toEqual([{ first: true, rows: [0, 0], table: true, closing: true }])
  })

  it('leaves room for page numbers when they are on', () => {
    const fill = Math.floor((PAGE_CONTENT_HEIGHT - 95 * MM - 12 * MM - 62 * MM - 3) / row)
    expect(planPages(heights(Array(fill).fill(row)))).toHaveLength(1)
    expect(planPages(heights(Array(fill).fill(row)), PAGE_CONTENT_HEIGHT - 6 * MM)).toHaveLength(2)
  })
})

describe('PDF export helpers', () => {
  it('picks the same font face the browser used', () => {
    expect(faceOf({ fontFamily: 'Arimo, Arial, sans-serif', fontWeight: '400', fontStyle: 'normal' })).toBe('arimo-400')
    expect(faceOf({ fontFamily: 'Arimo, Arial, sans-serif', fontWeight: '700', fontStyle: 'italic' })).toBe('arimo-700-italic')
    expect(faceOf({ fontFamily: '"Cormorant Garamond", Georgia, serif', fontWeight: '700', fontStyle: 'normal' })).toBe('cormorant-700')
  })

  it('reads computed colours and skips transparent ones', () => {
    expect(parseColor('rgb(15, 42, 69)')?.color).toEqual({ type: 'RGB', red: 15 / 255, green: 42 / 255, blue: 69 / 255 })
    expect(parseColor('rgba(0, 0, 0, 0)')).toBeNull()
    expect(parseColor('rgba(255, 255, 255, 0.5)')?.alpha).toBe(0.5)
  })

  it('places the baseline and contained images like the browser', () => {
    // Arimo: ascent 0.905, descent 0.212 of the font size.
    expect(baselineOffset(12 * 1.117, 12, 0.905, 0.212)).toBeCloseTo(12 * 0.905)
    expect(containBox({ x: 0, y: 0, width: 200, height: 100 }, { width: 100, height: 100 })).toEqual({ x: 50, y: 0, width: 100, height: 100 })
  })
})
