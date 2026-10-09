import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'

export type MenuItem = {
  id: string
  label: string
  onSelect: () => void
  icon?: LucideIcon
  disabled?: boolean
  danger?: boolean
}

export type MenuTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string | undefined
  onClick: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}

export type DropdownMenuProps = {
  items: MenuItem[]
  // Spread the props onto a button, e.g. (props) => <Button {...props}>Actions</Button>.
  trigger: (props: MenuTriggerProps) => ReactNode
  align?: 'start' | 'end'
  className?: string
}

export function DropdownMenu({ items, trigger, align = 'start', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const enabled = items.flatMap((item, index) => (item.disabled ? [] : [index]))

  useEffect(() => {
    if (!open) return
    const first = items.findIndex((item) => !item.disabled)
    itemRefs.current[first]?.focus()

    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // Depends on open only: focus moves when the menu opens, not when the items array is re-created.
  }, [open])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = enabled.indexOf(itemRefs.current.findIndex((el) => el === document.activeElement))
    let next: number | undefined
    if (event.key === 'ArrowDown') next = enabled[(current + 1) % enabled.length]
    else if (event.key === 'ArrowUp') next = enabled[(current - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    } else if (event.key === 'Tab') {
      close(false)
      return
    }
    if (next === undefined) return
    event.preventDefault()
    itemRefs.current[next]?.focus()
  }

  return (
    <div ref={wrapperRef} className={cn('relative inline-block', className)}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => setOpen((value) => !value),
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        },
      })}
      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute top-full z-40 mt-1 min-w-[200px] rounded-card border border-rule bg-surface py-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close(true)
                item.onSelect()
              }}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-[1rem] whitespace-nowrap sm:min-h-[32px]',
                'transition-colors duration-150 enabled:hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:-outline-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                item.danger ? 'text-bad' : 'text-ink',
              )}
            >
              {item.icon && <Icon icon={item.icon} size={16} className="shrink-0" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
