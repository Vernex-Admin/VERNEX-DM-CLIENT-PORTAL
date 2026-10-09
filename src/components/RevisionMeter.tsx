import { cn } from '../lib/cn'

export type MeterTone = 'neutral' | 'warn' | 'bad'

/** Neutral up to half, amber from two thirds, red at the limit. */
export function revisionTone(used: number, limit: number): MeterTone {
  if (limit <= 0 || used >= limit) return 'bad'
  return used / limit >= 2 / 3 ? 'warn' : 'neutral'
}

const FILL: Record<MeterTone, string> = { neutral: 'bg-ink-muted', warn: 'bg-warn', bad: 'bg-bad' }

export type RevisionMeterProps = {
  used: number
  limit: number
  /** What the revisions are for, shown above the bar. */
  title?: string
  className?: string
}

export function RevisionMeter({ used, limit, title, className }: RevisionMeterProps) {
  const tone = revisionTone(used, limit)
  const text = `Revision ${used} of ${limit} used`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {title && <p className="truncate leading-snug font-medium">{title}</p>}
      <div role="img" aria-label={text} className="flex gap-1">
        {Array.from({ length: Math.max(limit, 1) }, (_, index) => (
          <span
            key={index}
            className={cn('h-2 flex-1 rounded-field', index < used ? FILL[tone] : 'border border-rule bg-surface')}
          />
        ))}
      </div>
      <p className={cn('text-sm', tone === 'bad' ? 'font-medium text-bad' : tone === 'warn' ? 'font-medium text-warn' : 'text-ink-muted')}>
        {text}
      </p>
    </div>
  )
}
