import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { Tone } from './tone'

const dots: Record<Tone, string> = {
  neutral: 'bg-ink-muted',
  signal: 'bg-signal',
  ok: 'bg-ok',
  info: 'bg-info',
  bad: 'bg-bad',
}

export type PillProps = {
  tone?: Tone
  // The label is required: status is never carried by the dot colour alone.
  children: ReactNode
  className?: string
}

export function Pill({ tone = 'neutral', children, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-field border border-rule bg-surface px-2 py-0.5 text-sm whitespace-nowrap text-ink',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', dots[tone])} />
      {children}
    </span>
  )
}
