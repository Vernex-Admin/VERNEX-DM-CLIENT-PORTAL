import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'
import { controlClasses } from './control'
import { useFieldControl } from './Field'

export type TextareaProps = ComponentProps<'textarea'>

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  const control = useFieldControl(props)
  return <textarea rows={rows} className={cn(controlClasses, 'py-2 leading-normal', className)} {...control} />
}
