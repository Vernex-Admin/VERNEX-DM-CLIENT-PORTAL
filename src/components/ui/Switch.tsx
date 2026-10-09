import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type SwitchProps = Omit<ComponentProps<'input'>, 'type' | 'role' | 'children'> & {
  label: ReactNode
}

export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label
      className={cn(
        'inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 sm:min-h-0',
        'has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className,
      )}
    >
      <span className="relative inline-flex h-[22px] w-[38px] shrink-0">
        <input
          type="checkbox"
          role="switch"
          className={cn(
            'peer size-full cursor-[inherit] appearance-none rounded-full border border-ink-muted bg-surface',
            'transition-colors duration-150 checked:border-ink checked:bg-ink',
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-[3px] left-[3px] size-[16px] rounded-full bg-ink-muted',
            'transition-transform duration-150 peer-checked:translate-x-[16px] peer-checked:bg-surface',
          )}
        />
      </span>
      <span className="text-ink">{label}</span>
    </label>
  )
}
