import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'
import { controlClasses, controlHeight } from './control'
import { useFieldControl } from './Field'

export type SelectProps = ComponentProps<'select'>

export function Select({ className, children, ...props }: SelectProps) {
  const control = useFieldControl(props)
  return (
    <span className="relative block">
      <select className={cn(controlClasses, controlHeight, 'appearance-none pr-9', className)} {...control}>
        {children}
      </select>
      <Icon
        icon={ChevronDown}
        size={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
      />
    </span>
  )
}
