import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { Wordmark } from '../../components/Wordmark'
import { LOGIN_PATH } from '../../components/guards'
import { Card, CardBody, Skeleton } from '../../components/ui'
import {
  ACCESS_REMOVED_MESSAGE,
  clearReturnPath,
  peekReturnPath,
  signInErrorMessage,
  takeAccessRemoved,
} from '../../lib/authMessages'
import { audienceOf } from '../../lib/permissions'
import { useCurrentProfile } from '../../lib/queries'

/** An error Supabase put in the address after a failed link or Google sign-in. */
function errorInUrl(): string | null {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const raw = search.get('error_description') ?? hash.get('error_description') ?? search.get('error') ?? hash.get('error')
  return raw ? signInErrorMessage(raw) : null
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark />
        </div>
        <Card>
          <CardBody className="flex flex-col gap-3 p-5">{children}</CardBody>
        </Card>
      </div>
    </main>
  )
}

function Failed({ message }: { message: string }) {
  return (
    <Shell>
      <h1 className="text-[1.5rem] leading-snug">We could not sign you in</h1>
      <p role="alert" className="text-bad">
        {message}
      </p>
      <Link to="/login" className="font-medium text-ink underline underline-offset-2">
        Back to sign in
      </Link>
    </Shell>
  )
}

/**
 * Where the emailed link and the Google redirect land. Supabase turns the address into a session
 * (getCurrentProfile waits for that), then the person goes on to the page they asked for, or home.
 */
export default function AuthCallbackPage() {
  const urlError = useMemo(() => errorInUrl(), [])
  const profile = useCurrentProfile()
  const returnTo = peekReturnPath()

  // The remembered page is used once.
  useEffect(() => {
    if (profile.data) clearReturnPath()
  }, [profile.data])

  if (urlError) return <Failed message={urlError} />

  if (profile.isPending) {
    return (
      <Shell>
        <div aria-busy="true" role="status" className="flex flex-col gap-3">
          <p className="text-ink-muted">Signing you in...</p>
          <Skeleton className="h-8 w-full" />
        </div>
      </Shell>
    )
  }

  if (profile.isError) return <Failed message={profile.error.message} />

  if (!profile.data) {
    // No session came out of the link: access was removed, or the link was used or has expired.
    return (
      <Failed
        message={
          takeAccessRemoved(false) ? ACCESS_REMOVED_MESSAGE : 'That sign-in link has expired or was already used. Ask for a new one.'
        }
      />
    )
  }

  // The login routes already know where each side of the portal starts (and the first-login setup
  // form), so hand over to them: staff land in /admin, clients on the dashboard or the page asked for.
  const audience = audienceOf(profile.data)
  if (!audience) return <Failed message={ACCESS_REMOVED_MESSAGE} />
  return <Navigate to={LOGIN_PATH[audience]} replace state={{ from: returnTo }} />
}
