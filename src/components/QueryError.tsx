import { CircleAlert } from 'lucide-react'
import { Button, EmptyState } from './ui'

/** The error state every page uses when a query fails. `what` finishes "We couldn't load ...". */
export function QueryError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={CircleAlert}
        title={`We couldn't load ${what}`}
        description="Check your connection and try again."
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    </div>
  )
}
