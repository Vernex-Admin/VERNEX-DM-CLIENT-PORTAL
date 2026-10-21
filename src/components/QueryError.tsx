import { CircleAlert, DatabaseZap } from 'lucide-react'
import { DataError } from '../lib/queries'
import { Button, EmptyState } from './ui'

/**
 * The error state every page uses when a query fails. `what` finishes "We couldn't load ...".
 * Pass the query's `error` so a database that is behind the app is reported as that, not as a
 * connection problem.
 */
export function QueryError({ what, onRetry, error }: { what: string; onRetry: () => void; error?: unknown }) {
  if (error instanceof DataError && error.code === 'not_set_up') {
    return (
      <div role="alert">
        <EmptyState icon={DatabaseZap} title={`${capitalise(what)} can't be shown yet`} description={error.message} />
      </div>
    )
  }
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

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
