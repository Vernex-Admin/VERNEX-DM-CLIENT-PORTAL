// Query keys: [resource], [resource, 'list', filter], [resource, 'detail', id].
// Invalidating [resource] refreshes every list and detail of that resource.

export const R = {
  session: 'session',
  clients: 'clients',
  clientUsers: 'client_users',
  accountLead: 'account_lead',
  staff: 'staff',
  projects: 'projects',
  milestones: 'milestones',
  deliverables: 'deliverables',
  deliverableVersions: 'deliverable_versions',
  activity: 'activity',
  revisions: 'revisions',
  serviceRequests: 'service_requests',
  invoices: 'invoices',
  actionItems: 'action_items',
  comments: 'comments',
  files: 'files',
  founderBox: 'founder_box',
  socialMetrics: 'social_metrics',
  leads: 'leads',
  leadActivity: 'lead_activity',
  reminders: 'reminders',
  aiDrafts: 'ai_drafts',
} as const

export type ResourceKey = (typeof R)[keyof typeof R]

export const keys = {
  all: (resource: ResourceKey) => [resource] as const,
  lists: (resource: ResourceKey) => [resource, 'list'] as const,
  list: (resource: ResourceKey, filter: object = {}) => [resource, 'list', filter] as const,
  detail: (resource: ResourceKey, id: string | undefined) => [resource, 'detail', id] as const,
}
