import { Check, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatShortDate } from '../lib/dates'
import type { Milestone, MilestoneStatus } from '../types/db'
import { Icon } from './Icon'

const STATE_LABEL: Record<MilestoneStatus, string> = {
  done: 'Done',
  current: 'In progress',
  upcoming: 'Upcoming',
  blocked: 'On hold',
}

function Marker({ status }: { status: MilestoneStatus }) {
  const base = 'relative z-10 flex size-[24px] shrink-0 items-center justify-center rounded-full border-2 bg-surface'
  if (status === 'done') {
    return (
      <span className={cn(base, 'border-ok bg-ok text-surface')}>
        <Icon icon={Check} size={14} />
      </span>
    )
  }
  if (status === 'blocked') {
    return (
      <span className={cn(base, 'border-bad bg-bad text-surface')}>
        <Icon icon={X} size={14} />
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span className={cn(base, 'border-signal')}>
        <span className="size-[10px] rounded-full bg-signal" />
      </span>
    )
  }
  return <span className={cn(base, 'border-rule')} />
}

export type MilestoneStepperProps = {
  milestones: Milestone[]
  /** Share complete (0 to 100) for each milestone id; falls back to 100 for done and 0 otherwise. */
  percentComplete?: Record<string, number>
}

/** Vertical on a phone, horizontal from 768px. */
export function MilestoneStepper({ milestones, percentComplete = {} }: MilestoneStepperProps) {
  const ordered = [...milestones].sort((a, b) => a.position - b.position)

  return (
    <ol aria-label="Project milestones" className="flex flex-col md:flex-row">
      {ordered.map((milestone, index) => {
        const last = index === ordered.length - 1
        const percent = Math.round(percentComplete[milestone.id] ?? (milestone.status === 'done' ? 100 : 0))
        return (
          <li
            key={milestone.id}
            aria-current={milestone.status === 'current' ? 'step' : undefined}
            className={cn('relative flex gap-3 md:flex-1 md:flex-col md:gap-2', !last && 'pb-4 md:pb-0')}
          >
            {!last && (
              <>
                <span
                  aria-hidden="true"
                  className={cn('absolute top-[24px] -bottom-0 left-[11px] w-0.5 md:hidden', milestone.status === 'done' ? 'bg-ok' : 'bg-rule')}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-[11px] left-[24px] hidden h-0.5 w-[calc(100%-24px)] md:block',
                    milestone.status === 'done' ? 'bg-ok' : 'bg-rule',
                  )}
                />
              </>
            )}
            <Marker status={milestone.status} />
            <div className="min-w-0 md:pr-3">
              <p className="leading-snug font-medium">{milestone.title}</p>
              <p className="text-sm text-ink-muted">
                <span className={cn(milestone.status === 'blocked' && 'font-medium text-bad')}>
                  {STATE_LABEL[milestone.status]}
                </span>
                {milestone.due_date && <> · Due {formatShortDate(milestone.due_date)}</>}
                {' · '}
                <span className="font-mono">{percent}%</span>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
