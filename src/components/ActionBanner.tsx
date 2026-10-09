import { Check } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { ctaFor, dueLabel, sortActionItems } from '../lib/actionItems'
import type { ActionItem } from '../types/db'
import { Icon } from './Icon'
import { Button } from './ui'

export type ActionBannerProps = {
  /** Open items. The banner sorts them and shows the top two. */
  items: ActionItem[]
  projectNames?: Record<string, string>
}

export function ActionBanner({ items, projectNames = {} }: ActionBannerProps) {
  const navigate = useNavigate()
  const sorted = sortActionItems(items)

  if (sorted.length === 0) {
    return (
      <p className="flex items-center gap-2 font-medium text-ok">
        <Icon icon={Check} size={18} />
        You&rsquo;re all caught up
      </p>
    )
  }

  return (
    <section aria-label="Needs your attention" className="border-l-4 border-signal pl-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[1.2rem] leading-snug">
          {sorted.length === 1 ? '1 thing needs' : `${sorted.length} things need`} you to keep moving
        </h2>
        <Link to="/approvals" className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-medium underline underline-offset-2">
          See all
        </Link>
      </div>
      <ul className="mt-1 flex flex-col divide-y divide-rule">
        {sorted.slice(0, 2).map((item) => {
          const cta = ctaFor(item)
          const project = item.project_id ? projectNames[item.project_id] : undefined
          const meta = [project, dueLabel(item)].filter(Boolean).join(' · ')
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="leading-snug">{item.title}</p>
                {meta && <p className="text-sm text-ink-muted">{meta}</p>}
              </div>
              <Button variant="primary" size="sm" onClick={() => navigate(cta.to)}>
                {cta.label}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
