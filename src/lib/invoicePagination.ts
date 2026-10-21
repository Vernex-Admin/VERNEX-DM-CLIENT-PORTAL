// Splits an invoice into A4 pages. The screen preview, the printout and the downloaded PDF all use
// the same plan, so they break in the same places. Heights are CSS pixels measured from the
// laid-out invoice (see useInvoicePagination); nothing is scaled down to squeeze onto a page.

/** A4 is 297mm tall; the page has 8mm padding top and bottom. */
export const MM = 96 / 25.4
export const PAGE_CONTENT_HEIGHT = (297 - 16) * MM
/** Room kept for "Page 2 of 3" when page numbers are on. */
export const PAGE_NUMBER_HEIGHT = 6 * MM
/** Rounding and table-border slack, so a measured fit is a real fit. */
const SLACK = 3

export type BlockHeights = {
  /** First page: letterhead, invoice details, Bill To and Project Details. */
  top: number
  /** Later pages: the short "continued" heading. */
  continued: number
  /** The table's header row, with the space above the table. */
  tableHead: number
  /** Each service row, in order. */
  rows: number[]
  /** QR, totals and footer, which always stay together. */
  closing: number
}

export type PagePlan = {
  /** The first page carries the letterhead; later pages the "continued" heading. */
  first: boolean
  /** Service rows on this page: [start, end). */
  rows: [number, number]
  /** Whether the table (with its header row) appears on this page. */
  table: boolean
  /** Whether the totals and footer are on this page (always the last page). */
  closing: boolean
}

export function planPages(heights: BlockHeights, pageHeight: number = PAGE_CONTENT_HEIGHT): PagePlan[] {
  const limit = pageHeight - SLACK
  const count = heights.rows.length
  const pages: PagePlan[] = []
  let next = 0

  // Bounded so bad measurements can never loop forever.
  while (pages.length <= count + 2) {
    const first = pages.length === 0
    let used = first ? heights.top : heights.continued
    const start = next
    let table = false

    if (next < count) {
      const withHead = used + heights.tableHead
      let end = next
      let height = withHead
      while (end < count && height + (heights.rows[end] ?? 0) <= limit) {
        height += heights.rows[end] ?? 0
        end++
      }
      if (end === start) {
        if (first) {
          // Nothing fits under the letterhead: start the table on the next page, never a bare header.
          pages.push({ first, rows: [start, start], table: false, closing: false })
          continue
        }
        // A row taller than a whole page (prevented by the description limits): give it a page.
        height += heights.rows[end] ?? 0
        end++
      }
      table = true
      used = height
      next = end
    } else if (count === 0 && first) {
      table = true
      used += heights.tableHead
    }

    const closing = next >= count && used + heights.closing <= limit
    pages.push({ first, rows: [start, next], table, closing })
    if (closing) break
    if (next >= count) {
      pages.push({ first: false, rows: [count, count], table: false, closing: true })
      break
    }
  }
  return pages
}
