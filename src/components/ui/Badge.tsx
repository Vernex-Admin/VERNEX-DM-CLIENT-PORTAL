import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { Tone } from './tone'

const tones: Record<Tone, string> = {
  neutral: 'bg-rule text-ink',
  signal: 'bg-signal text-surface',
  ok: 'bg-ok text-surface',
  info: 'bg-info text-surface',
  bad: 'bg-bad text-surface',
  warn: 'bg-warn text-surface',
}

export type BadgeProps = {
  tone?: Tone
  children: ReactNode
  className?: string
}

// Small counts and codes, e.g. "3" pending approvals or "v2".
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-field px-1.5 font-mono text-[12px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
