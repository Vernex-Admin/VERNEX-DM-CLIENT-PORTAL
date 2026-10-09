import { cn } from '../lib/cn'

// No logo file has been supplied yet, so the Vernex mark is set in the display face.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-[1.4rem] leading-none font-semibold text-ink', className)}>
      Vernex
      <span className="text-signal">.</span>
    </span>
  )
}
