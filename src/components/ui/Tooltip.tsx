import { cloneElement, useId, useState } from 'react'
import type { ReactElement } from 'react'
import { cn } from '../../lib/cn'

export type TooltipProps = {
  label: string
  // A single focusable element, e.g. an icon button.
  children: ReactElement<{ 'aria-describedby'?: string }>
  side?: 'top' | 'bottom'
}

// Shows on hover and on keyboard focus; Esc hides it. The bubble stays open while hovered.
export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) setOpen(true)
      }}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        className={cn(
          'absolute left-1/2 z-40 -translate-x-1/2 transition-opacity duration-150',
          side === 'top' ? 'bottom-full pb-1.5' : 'top-full pt-1.5',
          open ? 'opacity-100' : 'invisible opacity-0',
        )}
      >
        <span
          role="tooltip"
          id={id}
          className="block rounded-field bg-ink px-2 py-1 text-[12px] leading-snug whitespace-nowrap text-paper"
        >
          {label}
        </span>
      </span>
    </span>
  )
}
