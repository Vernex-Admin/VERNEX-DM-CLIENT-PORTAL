import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '../lib/cn'
import { changeTone } from '../lib/kpis'
import type { Kpi } from '../lib/kpis'
import { formatINR } from '../lib/money'
import { Icon } from './Icon'

const count = new Intl.NumberFormat('en-IN')

function value(kpi: Pick<Kpi, 'unit' | 'value'>): string {
  return kpi.unit === 'money' ? formatINR(kpi.value) : count.format(kpi.value)
}

const TONE_CLASS = { good: 'text-ok', bad: 'text-bad', flat: 'text-ink-muted' }

/** `comparedWith` finishes the sentence "12% vs ...", e.g. "the previous 15 days". */
export function KpiStrip({
  kpis,
  comparedWith,
  separate = false,
}: {
  kpis: (Omit<Kpi, 'id'> & { id: string })[]
  comparedWith: string
  /** Each KPI in its own bordered card, for counts that do not fill a four-column strip. */
  separate?: boolean
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 lg:grid-cols-4',
        separate ? 'gap-3' : 'gap-px overflow-hidden rounded-card border border-rule bg-rule',
      )}
    >
      {kpis.map((kpi) => {
        const tone = changeTone(kpi)
        const rose = (kpi.change ?? 0) > 0
        return (
          <div
            key={kpi.id}
            className={cn('flex flex-col gap-1 bg-surface p-4', separate && 'rounded-card border border-rule')}
          >
            <dt className="text-sm text-ink-muted">{kpi.label}</dt>
            <dd className="font-display text-[1.75rem] leading-none font-semibold">{value(kpi)}</dd>
            <dd className={cn('flex items-center gap-1 text-sm', TONE_CLASS[tone])}>
              {kpi.change === null ? (
                'No earlier data'
              ) : (
                <>
                  <Icon icon={tone === 'flat' ? Minus : rose ? ArrowUp : ArrowDown} size={14} />
                  <span>
                    {Math.abs(Math.round(kpi.change * 100))}% {tone === 'flat' ? 'flat' : rose ? 'up' : 'down'}
                  </span>
                  <span className="text-ink-muted">vs {comparedWith}</span>
                </>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
