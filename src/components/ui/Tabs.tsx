import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type TabItem = {
  id: string
  label: string
  content: ReactNode
  disabled?: boolean
}

export type TabsProps = {
  items: TabItem[]
  // Accessible name for the tab list.
  label: string
  value?: string
  defaultValue?: string
  onValueChange?: (id: string) => void
  className?: string
}

export function Tabs({ items, label, value, defaultValue, onValueChange, className }: TabsProps) {
  const baseId = useId()
  const [inner, setInner] = useState(defaultValue ?? items.find((item) => !item.disabled)?.id)
  const activeId = value ?? inner
  const active = items.find((item) => item.id === activeId)

  const tabId = (id: string) => `${baseId}-tab-${id}`
  const panelId = (id: string) => `${baseId}-panel-${id}`

  function select(id: string) {
    setInner(id)
    onValueChange?.(id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((item) => !item.disabled)
    const index = enabled.findIndex((item) => item.id === activeId)
    let next: TabItem | undefined
    if (event.key === 'ArrowRight') next = enabled[(index + 1) % enabled.length]
    else if (event.key === 'ArrowLeft') next = enabled[(index - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    if (!next) return
    event.preventDefault()
    select(next.id)
    document.getElementById(tabId(next.id))?.focus()
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 border-b border-rule">
        {items.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={selected}
              aria-controls={panelId(item.id)}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => select(item.id)}
              className={cn(
                '-mb-px min-h-[44px] border-b-2 px-3 text-[1rem] whitespace-nowrap transition-colors duration-150 sm:min-h-[36px]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                selected
                  ? 'border-ink font-medium text-ink'
                  : 'border-transparent text-ink-muted enabled:hover:text-ink',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {active && (
        <div role="tabpanel" id={panelId(active.id)} aria-labelledby={tabId(active.id)} tabIndex={0} className="pt-4">
          {active.content}
        </div>
      )}
    </div>
  )
}
