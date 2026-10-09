import { cn } from '../../lib/cn'

// Size it with className, e.g. "h-4 w-40". Wrap a loading region in aria-busy on the parent.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-field bg-rule', className)} />
}
