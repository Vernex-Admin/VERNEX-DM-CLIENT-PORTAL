import { Link } from 'react-router'
import { cn } from '../lib/cn'
import type { HealthStatus } from '../types/db'
import type { Tone } from './ui'

const DOT: Record<Tone, string> = {
  neutral: 'bg-ink-muted',
  signal: 'bg-signal',
  ok: 'bg-ok',
  info: 'bg-info',
  bad: 'bg-bad',
  warn: 'bg-warn',
}

/** Plain words for the client: a review that waits on them reads "Waiting on you", not "In review". */
export function healthLabel(status: HealthStatus, waitingOnYou: boolean): { label: string; tone: Tone } {
  switch (status) {
    case 'on_track':
      return { label: 'On track', tone: 'ok' }
    case 'in_review':
      return waitingOnYou ? { label: 'Waiting on you', tone: 'warn' } : { label: 'In review', tone: 'info' }
    case 'blocked':
      return { label: 'On hold', tone: 'bad' }
    case 'completed':
      return { label: 'Completed', tone: 'neutral' }
  }
}

export type HealthPillProps = {
  status: HealthStatus
  /** The project this pill is about. */
  name: string
  waitingOnYou?: boolean
  /** One line of why, e.g. "Waiting on you: approve Reel 4". */
  reason?: string | null
  to?: string
}

export function HealthPill({ status, name, waitingOnYou = false, reason, to }: HealthPillProps) {
  const { label, tone } = healthLabel(status, waitingOnYou)
  const body = (
    <>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('size-[9px] shrink-0 rounded-full', DOT[tone])} />
        <span className="font-medium">{label}</span>
        <span className="min-w-0 truncate text-ink-muted">{name}</span>
      </span>
      {reason && <span className="pl-[17px] text-sm text-ink-muted">{reason}</span>}
    </>
  )
  const className = 'flex min-h-[44px] flex-col justify-center gap-0.5 rounded-field'
  return to ? (
    <Link to={to} className={cn(className, 'transition-colors duration-150 hover:bg-ink/5')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
