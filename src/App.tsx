import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { RedirectIfSignedIn, RequireClient, RequireStaff } from './components/guards'
import { AdminShell } from './components/shell/AdminShell'
import { ClientShell } from './components/shell/ClientShell'
import { Skeleton } from './components/ui'
import { NoAccess, NotFound } from './pages/Status'

// Every screen is its own chunk, fetched when its route is first visited. The shells, route guards
// and the small status pages stay in the main bundle because every visit needs them.
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })))

const DashboardPage = lazy(() => import('./pages/client/DashboardPage'))
const ApprovalsPage = lazy(() => import('./pages/client/ApprovalsPage'))
const DeliverablePage = lazy(() => import('./pages/client/DeliverablePage'))
const RequestsPage = lazy(() => import('./pages/client/RequestsPage'))
const VaultPage = lazy(() => import('./pages/client/VaultPage'))
const PerformancePage = lazy(() => import('./pages/client/PerformancePage'))
const BillingPage = lazy(() => import('./pages/client/BillingPage'))
const FounderBoxPage = lazy(() => import('./pages/client/FounderBoxPage'))
const ProfilePage = lazy(() => import('./pages/client/ProfilePage'))

const ClientsPage = lazy(() => import('./pages/admin/ClientsPage'))
const ClientPage = lazy(() => import('./pages/admin/client/ClientPage'))
const PreviewPage = lazy(() => import('./pages/admin/client/PreviewPage'))
const PipelinePage = lazy(() => import('./pages/admin/PipelinePage'))
const OutboxPage = lazy(() => import('./pages/admin/OutboxPage'))
const FounderInboxPage = lazy(() => import('./pages/admin/FounderInboxPage'))
const AiDraftsPage = lazy(() => import('./pages/admin/AiDraftsPage'))

// Development only: the gallery is not routed or bundled in production builds.
const UiGallery = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiGallery')) : null

/** What shows, inside the shell, while a page's code loads. */
function PageLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-4xl flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

const page = (element: ReactNode) => <Suspense fallback={<PageLoading />}>{element}</Suspense>

export default function App() {
  return (
    <Routes>
      {UiGallery && <Route path="/dev/ui" element={page(<UiGallery />)} />}

      <Route element={<RedirectIfSignedIn />}>
        <Route path="/login" element={page(<LoginPage audience="client" />)} />
        <Route path="/admin/login" element={page(<LoginPage audience="staff" />)} />
      </Route>

      <Route element={<RequireClient />}>
        <Route element={<ClientShell />}>
          <Route index element={page(<DashboardPage />)} />
          <Route path="approvals" element={page(<ApprovalsPage />)} />
          <Route path="deliverables/:id" element={page(<DeliverablePage />)} />
          <Route path="requests" element={page(<RequestsPage />)} />
          <Route path="vault" element={page(<VaultPage />)} />
          <Route path="performance" element={page(<PerformancePage />)} />
          <Route path="billing" element={page(<BillingPage />)} />
          <Route path="founder-box" element={page(<FounderBoxPage />)} />
          <Route path="settings/profile" element={page(<ProfilePage />)} />
          <Route path="profile" element={<Navigate to="/settings/profile" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="admin" element={<RequireStaff />}>
        <Route element={<AdminShell />}>
          <Route index element={<Navigate to="clients" replace />} />
          <Route path="clients" element={page(<ClientsPage />)} />
          <Route path="clients/:id" element={page(<ClientPage />)} />
          <Route path="clients/:id/preview" element={page(<PreviewPage />)} />
          <Route path="pipeline" element={page(<PipelinePage />)} />
          <Route path="outbox" element={page(<OutboxPage />)} />
          <Route path="founder-inbox" element={page(<FounderInboxPage />)} />
          <Route path="ai-drafts" element={page(<AiDraftsPage />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="no-access" element={<NoAccess />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
