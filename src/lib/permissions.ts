import type { Profile, UserRole } from '../types/db'
import { useSessionProfile } from './session-context'

// The one place permissions live. Screens ask useCan(); the data layer asks can().
// Nothing else should branch on `profile.role`.

export type Resource =
  | 'client'
  | 'client_user'
  | 'project'
  | 'milestone'
  | 'deliverable'
  | 'revision'
  | 'service_request'
  | 'invoice'
  | 'action_item'
  | 'brand_asset'
  | 'comment'
  | 'internal_comment'
  | 'social_metrics'
  | 'founder_box'
  | 'founder_inbox'
  | 'lead'
  | 'reminder'
  | 'ai_draft'

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'request_revision' | 'upload'

export type Permission = `${Resource}:${Action}`

function crud<R extends Resource>(resource: R) {
  return [`${resource}:view`, `${resource}:create`, `${resource}:edit`, `${resource}:delete`] as const
}

// Vernex admin roles: full control of client work. They never approve on a client's behalf.
const STAFF: readonly Permission[] = [
  ...crud('client'),
  ...crud('client_user'),
  ...crud('project'),
  ...crud('milestone'),
  ...crud('deliverable'),
  ...crud('invoice'),
  ...crud('service_request'),
  ...crud('action_item'),
  ...crud('lead'),
  ...crud('reminder'),
  ...crud('ai_draft'),
  'revision:view',
  'revision:edit',
  'brand_asset:view',
  'brand_asset:upload',
  'brand_asset:delete',
  'comment:view',
  'comment:create',
  'internal_comment:view',
  'internal_comment:create',
  'social_metrics:view',
]

// Client roles: view their own client's data, plus the six things a client can do.
// Deliberately absent: internal_comment, lead, founder_inbox, and every create/edit/delete
// on clients, client users, projects, milestones, deliverables and invoices.
const CLIENT: readonly Permission[] = [
  'client:view',
  'client_user:view',
  'project:view',
  'milestone:view',
  'deliverable:view',
  'revision:view',
  'service_request:view',
  'invoice:view',
  'action_item:view',
  'brand_asset:view',
  'comment:view',
  'social_metrics:view',

  'deliverable:approve', // client_member: only with can_approve (see can())
  'deliverable:request_revision', // client_member: only with can_approve
  'service_request:create',
  'brand_asset:upload',
  'comment:create',
  'founder_box:create',
]

export const POLICY: Record<UserRole, readonly Permission[]> = {
  // Only the founder reads the Founder Box; the PM sees none of it.
  vernex_founder: [...STAFF, 'founder_inbox:view', 'founder_inbox:edit'],
  vernex_pm: STAFF,
  client_admin: CLIENT,
  client_member: CLIENT,
}

export type PermissionContext = {
  /** The client that owns the record being acted on. */
  clientId?: string
}

/**
 * Whether `profile` may do `action` on `resource`.
 *
 * Two conditions sit on top of the POLICY map:
 * - A client user can only act on their own client. Pass `ctx.clientId` whenever a specific
 *   record is involved; without it the answer is "can this role ever do this".
 * - A `client_member` can approve or request a revision only if `can_approve` is set.
 *
 * Which clients a PM is assigned to is enforced by the data layer (and by RLS later).
 */
export function can(
  profile: Profile | null | undefined,
  resource: Resource,
  action: Action,
  ctx: PermissionContext = {},
): boolean {
  if (!profile || !profile.is_active) return false
  if (!POLICY[profile.role].includes(`${resource}:${action}`)) return false

  const isClientUser = profile.role === 'client_admin' || profile.role === 'client_member'
  if (isClientUser && ctx.clientId !== undefined && ctx.clientId !== profile.client_id) return false

  const needsApprover = resource === 'deliverable' && (action === 'approve' || action === 'request_revision')
  if (needsApprover && profile.role === 'client_member' && !profile.can_approve) return false

  return true
}

/** Which side of the portal a profile belongs to; null when signed out. Used by route guards. */
export type Audience = 'staff' | 'client'

export function audienceOf(profile: Profile | null | undefined): Audience | null {
  if (!profile || !profile.is_active) return null
  return profile.role === 'vernex_founder' || profile.role === 'vernex_pm' ? 'staff' : 'client'
}

/** `can()` for the signed-in user. False while the session is loading. */
export function useCan(resource: Resource, action: Action, ctx?: PermissionContext): boolean {
  return can(useSessionProfile(), resource, action, ctx)
}
