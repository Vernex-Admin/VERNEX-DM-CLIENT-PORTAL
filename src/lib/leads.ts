import type { LeadStage } from '../types/db'
import { istDay } from './dates'

export const STAGE_LABEL: Record<LeadStage, string> = {
  new_lead: 'New Lead',
  researched: 'Researched',
  qualified: 'Qualified',
  outreach_sent: 'Outreach Sent',
  responded: 'Responded',
  discovery_call: 'Discovery Call',
  qualified_opportunity: 'Qualified Opportunity',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

const CLOSED: LeadStage[] = ['closed_won', 'closed_lost']

/** A follow-up is overdue once its IST day has passed and the lead is still open. */
export function isOverdue(lead: { follow_up_date: string | null; stage: LeadStage }, now: Date = new Date()): boolean {
  return Boolean(lead.follow_up_date) && !CLOSED.includes(lead.stage) && (lead.follow_up_date as string) < istDay(now)
}
