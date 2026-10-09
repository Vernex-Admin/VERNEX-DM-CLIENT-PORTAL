import { Navigate, Outlet, useLocation } from 'react-router'
import { useCurrentProfile } from '../lib/queries'
import { audienceOf } from '../lib/permissions'
import type { Audience } from '../lib/permissions'
import { Skeleton } from './ui'

export const LOGIN_PATH: Record<Audience, string> = { client: '/login', staff: '/admin/login' }
export const HOME_PATH: Record<Audience, string> = { client: '/', staff: '/admin' }

function useAudience() {
  const { data: profile, isPending } = useCurrentProfile()
  return { audience: audienceOf(profile), isPending }
}

function PageLoading() {
  return (
    <main aria-busy="true" className="flex min-h-dvh items-center justify-center bg-paper p-4">
      <Skeleton className="h-40 w-full max-w-sm" />
    </main>
  )
}

/** The page the user asked for before being sent to sign in, if it belongs on their side of the portal. */
function returnPath(from: unknown, audience: Audience): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return HOME_PATH[audience]
  const isAdminPath = from === '/admin' || from.startsWith('/admin/')
  const isLoginPath = from === '/login' || from === '/admin/login'
  if (isLoginPath || isAdminPath !== (audience === 'staff')) return HOME_PATH[audience]
  return from
}

function RequireAudience({ audience: required }: { audience: Audience }) {
  const location = useLocation()
  const { audience, isPending } = useAudience()
  if (isPending) return <PageLoading />
  if (!audience) {
    return <Navigate to={LOGIN_PATH[required]} replace state={{ from: location.pathname + location.search }} />
  }
  // Clients never reach /admin/*, and staff use /admin rather than the client portal.
  if (audience !== required) return <Navigate to={HOME_PATH[audience]} replace />
  return <Outlet />
}

export const RequireClient = () => <RequireAudience audience="client" />
export const RequireStaff = () => <RequireAudience audience="staff" />

/** Wraps a login page: signed-in users are sent on to where they were going, or to their home. */
export function RedirectIfSignedIn() {
  const location = useLocation()
  const { audience, isPending } = useAudience()
  if (isPending) return <PageLoading />
  if (audience) return <Navigate to={returnPath((location.state as { from?: unknown } | null)?.from, audience)} replace />
  return <Outlet />
}
