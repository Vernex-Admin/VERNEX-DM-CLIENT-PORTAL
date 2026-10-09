import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'

export type EmptyStateProps = {
  title: string
  // One line.
  description: string
  // One action, usually a single Button.
  action?: ReactNode
  icon?: LucideIcon
  // 1 when the state fills a whole page (nothing else names it); otherwise 2, under the page's own h1.
  headingLevel?: 1 | 2
  className?: string
}

export function EmptyState({ title, description, action, icon, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-card border border-rule bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <Icon icon={icon} size={24} className="mb-1 text-ink-muted" />}
      <Heading className="text-[1.2rem] leading-snug text-ink">{title}</Heading>
      <p className="text-ink-muted">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
