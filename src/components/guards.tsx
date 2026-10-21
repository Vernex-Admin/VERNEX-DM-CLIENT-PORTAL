import { Navigate, Outlet, useLocation } from 'react-router'
import { useClient, useCurrentProfile, useOnboarding } from '../lib/queries'
import { audienceOf } from '../lib/permissions'
import type { Audience } from '../lib/permissions'
import { Skeleton } from './ui'

export const LOGIN_PATH: Record<Audience, string> = { client: '/login', staff: '/login' }
export const HOME_PATH: Record<Audience, string> = { client: '/', staff: '/admin' }

function useAudience() {
  const { data: profile, isPending } = useCurrentProfile()
  return { audience: audienceOf(profile), isPending, profile }
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
  const { audience, isPending, profile } = useAudience()
  const clientId = profile?.client_id ?? undefined
  const clientQuery = useClient(clientId)
  const onboardingQuery = useOnboarding(clientId)

  if (isPending || (audience === 'client' && (clientQuery.isPending || onboardingQuery.isPending))) {
    return <PageLoading />
  }

  if (audience) {
    const rawFrom = (location.state as { from?: unknown } | null)?.from
    let target = returnPath(rawFrom, audience)
    if (audience === 'client' && (target === '/' || !rawFrom)) {
      const client = clientQuery.data
      const hasChecklist = (onboardingQuery.data ?? []).length > 0
      const answersEmpty = !client?.onboarding_answers || Object.keys(client.onboarding_answers).length === 0
      if (hasChecklist && answersEmpty) {
        target = '/setup'
      }
    }
    return <Navigate to={target} replace />
  }
  return <Outlet />
}
