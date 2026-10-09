import type { ComponentProps, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  label: ReactNode
  description?: string
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex min-h-[44px] cursor-pointer items-start gap-2.5 py-3 lg:min-h-0 lg:py-0',
        'has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className,
      )}
    >
      <span className="relative mt-[2px] inline-flex size-[18px] shrink-0">
        <input
          type="checkbox"
          className={cn(
            'peer size-[18px] cursor-[inherit] appearance-none rounded-field border border-ink-muted bg-surface',
            'transition-colors duration-150 checked:border-ink checked:bg-ink aria-invalid:border-bad',
          )}
          {...props}
        />
        <Icon
          icon={Check}
          size={14}
          className="pointer-events-none absolute inset-0 m-auto text-surface opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="flex flex-col">
        <span className="text-ink">{label}</span>
        {description && <span className="text-sm text-ink-muted">{description}</span>}
      </span>
    </label>
  )
}
