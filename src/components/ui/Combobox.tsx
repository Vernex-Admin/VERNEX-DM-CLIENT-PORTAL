import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'
import { controlClasses, controlHeight } from './control'
import { useFieldControl } from './Field'

export type ComboboxOption = { value: string; label: string; hint?: string }

export type ComboboxProps = {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Shown when typing matches nothing. */
  emptyText?: string
  id?: string
  'aria-label'?: string
}

/** A searchable single choice: type to filter, arrows to move, Enter to pick, Esc to close. */
export function Combobox({ options, value, onChange, placeholder, disabled, emptyText = 'No matches', ...props }: ComboboxProps) {
  const control = useFieldControl(props)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const selected = options.find((option) => option.value === value)
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(needle))
    : options
  const optionId = (index: number) => `${listId}-option-${index}`

  function choose(option: ComboboxOption | undefined) {
    if (!option) return
    onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => Math.min(matches.length - 1, open ? index + 1 : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      choose(matches[active])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="relative">
      <input
        {...control}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? optionId(active) : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onBlur={() => {
          setOpen(false)
          setQuery('')
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        className={cn(controlClasses, controlHeight, 'pr-9')}
      />
      <Icon icon={ChevronDown} size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted" />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-card border border-rule bg-surface py-1"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">{emptyText}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                // Pick before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(option)
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm',
                  index === active && 'bg-ink/5',
                  option.value === value && 'font-medium',
                )}
              >
                <span>{option.label}</span>
                {option.hint && <span className="text-xs text-ink-muted">{option.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
