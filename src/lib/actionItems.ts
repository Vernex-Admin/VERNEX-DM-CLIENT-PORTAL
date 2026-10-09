import type { ActionItem } from '../types/db'
import { istDay, istDaysBetween } from './dates'

/** Overdue first, then the ones that block a milestone, then by due date. */
export function sortActionItems(items: ActionItem[], now: Date = new Date()): ActionItem[] {
  const today = istDay(now)
  const overdue = (item: ActionItem) => item.due_at !== null && istDay(item.due_at) < today
  return [...items].sort((a, b) => {
    if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1
    if (a.blocks_milestone !== b.blocks_milestone) return a.blocks_milestone ? -1 : 1
    return (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')
  })
}

export type ActionCta = { label: 'Review' | 'Upload' | 'Pay' | 'Reply' | 'Confirm'; to: string }

/** The one button an item gets, and where it goes. */
export function ctaFor(item: ActionItem): ActionCta {
  switch (item.type) {
    case 'approval':
    case 'revision_response':
      return { label: 'Review', to: item.ref_id ? `/deliverables/${item.ref_id}` : '/approvals' }
    case 'missing_asset':
      return { label: 'Upload', to: '/vault' }
    case 'invoice_due':
      return { label: 'Pay', to: '/billing' }
    case 'meeting_confirm':
      return { label: 'Confirm', to: '/requests' }
    case 'info_request':
      return { label: 'Reply', to: '/requests' }
    case 'quote_acceptance':
      return { label: 'Review', to: '/requests' }
  }
}

/** "Overdue by 3 days", "Due today", "Due tomorrow", "Due in 4 days"; empty when there is no due date. */
export function dueLabel(item: Pick<ActionItem, 'due_at'>, now: Date = new Date()): string {
  if (!item.due_at) return ''
  const late = istDaysBetween(item.due_at, now)
  if (late > 0) return `Overdue by ${late} ${late === 1 ? 'day' : 'days'}`
  if (late === 0) return 'Due today'
  if (late === -1) return 'Due tomorrow'
  return `Due in ${-late} days`
}

