import type { Deliverable, Milestone } from '../types/db'

/**
 * Share of each milestone that is finished, 0 to 100. A done milestone is 100. Otherwise it is the
 * approved share of its deliverables, and a milestone with no deliverables is left out.
 */
export function milestonePercent(milestones: Milestone[], deliverables: Deliverable[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const milestone of milestones) {
    if (milestone.status === 'done') {
      result[milestone.id] = 100
      continue
    }
    const items = deliverables.filter((row) => row.milestone_id === milestone.id && row.status !== 'archived')
    if (items.length === 0) continue
    result[milestone.id] = Math.round((items.filter((row) => row.status === 'approved').length / items.length) * 100)
  }
  return result
}
