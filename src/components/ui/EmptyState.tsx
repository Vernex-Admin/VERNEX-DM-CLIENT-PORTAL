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
  className?: string
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-card border border-rule bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <Icon icon={icon} size={24} className="mb-1 text-ink-muted" />}
      <h3 className="text-[1.2rem] leading-snug text-ink">{title}</h3>
      <p className="text-ink-muted">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
