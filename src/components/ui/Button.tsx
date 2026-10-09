import type { ComponentProps } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border-signal bg-signal text-surface enabled:hover:bg-signal/90 enabled:active:bg-signal/80',
  secondary: 'border-rule bg-surface text-ink enabled:hover:bg-ink/5 enabled:active:bg-ink/10',
  ghost: 'border-transparent bg-transparent text-ink enabled:hover:bg-ink/5 enabled:active:bg-ink/10',
  danger: 'border-bad bg-bad text-surface enabled:hover:bg-bad/90 enabled:active:bg-bad/80',
}

// 44px tap height on mobile for both sizes; the compact heights apply from 640px up.
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[44px] px-3 text-sm sm:min-h-[30px]',
  md: 'min-h-[44px] px-4 text-[1rem] sm:min-h-[36px]',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-card border font-medium whitespace-nowrap',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Icon icon={LoaderCircle} size={16} className="animate-spin" />}
      {children}
    </button>
  )
}
