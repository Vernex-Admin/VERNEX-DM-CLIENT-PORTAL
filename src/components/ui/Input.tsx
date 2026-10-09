import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'
import { controlClasses, controlHeight } from './control'
import { useFieldControl } from './Field'

export type InputProps = ComponentProps<'input'>

export function Input({ className, ...props }: InputProps) {
  const control = useFieldControl(props)
  return <input className={cn(controlClasses, controlHeight, className)} {...control} />
}
