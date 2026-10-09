// Row types for the MVP tables. Names and columns follow docs/PRD.md section 4 (snake_case, as
// Postgres and the Supabase client return them), trimmed to what the MVP uses.
// `profiles` replaces the PRD's `users`; `service_requests` replaces `change_requests`.
// Not in the PRD: clients.city, clients.retainer_minor, clients.retainer_months,
// social_metrics_daily, leads.

export type UUID = string
/** Calendar date, `YYYY-MM-DD`. */
export type DateString = string
/** ISO 8601 timestamp, e.g. `2026-10-08T09:30:00.000Z`. */
export type Timestamp = string
/** Money in the smallest unit (paise): INR 15,000 is 1500000. */
export type Minor = number

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const USER_ROLES = ['vernex_founder', 'vernex_pm', 'client_admin', 'client_member'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const STAFF_ROLES = ['vernex_founder', 'vernex_pm'] as const satisfies readonly UserRole[]
export const CLIENT_ROLES = ['client_admin', 'client_member'] as const satisfies readonly UserRole[]
export type StaffRole = (typeof STAFF_ROLES)[number]
export type ClientRole = (typeof CLIENT_ROLES)[number]

export const HEALTH_STATUSES = ['on_track', 'in_review', 'blocked', 'completed'] as const
export type HealthStatus = (typeof HEALTH_STATUSES)[number]

export const DELIVERABLE_STATUSES = [
  'draft',
  'in_progress',
  'in_review',
  'revision_requested',
  'approved',
  'blocked',
  'archived',
] as const
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]

export const REVISION_STATUSES = [
  'submitted',
  'accepted',
  'in_progress',
  'delivered',
  'rejected_out_of_scope',
] as const
export type RevisionStatus = (typeof REVISION_STATUSES)[number]

export const INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const VISIBILITIES = ['internal', 'client'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export const PROJECT_TYPES = [
  'software',
  'web',
  'erp',
  'automation',
  'social_media',
  'video',
  'performance_marketing',
  'branding',
  'consulting',
] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const MILESTONE_STATUSES = ['upcoming', 'current', 'done', 'blocked'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export const DELIVERABLE_KINDS = [
  'video',
  'image',
  'design',
  'document',
  'post',
  'ad_creative',
  'web_page',
  'software_build',
  'report',
] as const
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number]

export const SERVICE_REQUEST_STATUSES = [
  'submitted',
  'estimating',
  'quoted',
  'negotiating',
  'accepted',
  'declined',
  'scheduled',
] as const
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number]

export const ACTION_ITEM_TYPES = [
  'approval',
  'revision_response',
  'missing_asset',
  'invoice_due',
  'info_request',
  'meeting_confirm',
  'quote_acceptance',
] as const
export type ActionItemType = (typeof ACTION_ITEM_TYPES)[number]

export const FILE_FOLDERS = [
  'brand_assets',
  'raw_video',
  'rendered_ads',
  'software_builds',
  'documents',
  'invoices',
] as const
export type FileFolder = (typeof FILE_FOLDERS)[number]

export const COMMENT_TARGETS = ['deliverable', 'file', 'project', 'service_request'] as const
export type CommentTarget = (typeof COMMENT_TARGETS)[number]

export const FEEDBACK_KINDS = ['csat', 'founder_box'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FOUNDER_CATEGORIES = ['praise', 'concern', 'complaint', 'idea', 'escalation'] as const
export type FounderCategory = (typeof FOUNDER_CATEGORIES)[number]

export const FEEDBACK_STATUSES = ['new', 'acknowledged', 'in_progress', 'resolved'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const LEAD_STATUSES = ['new', 'contacted', 'proposal_sent', 'won', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export type RevisionPriority = 'normal' | 'urgent'
export type ApprovedVia = 'portal' | 'offline_proxy'

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** A client organisation: the tenant. Every business row carries its `client_id`. */
export type Client = {
  id: UUID
  name: string
  slug: string
  logo_url: string | null
  industry: string | null
  city: string | null
  gstin: string | null
  billing_email: string | null
  currency: 'INR'
  /** Monthly retainer, if the client is on one. */
  retainer_minor: Minor | null
  retainer_months: number | null
  created_at: Timestamp
}

/** A person. `client_id` is null for Vernex staff and set for client users. */
export type Profile = {
  id: UUID
  client_id: UUID | null
  email: string
  full_name: string
  phone_e164: string | null
  avatar_url: string | null
  role: UserRole
  /** Only meaningful for `client_member`: set by the client admin. */
  can_approve: boolean
  is_active: boolean
  created_at: Timestamp
}

/** Which Vernex staff serve which client. The founder sees every client regardless. */
export type ClientAssignment = {
  client_id: UUID
  user_id: UUID
  is_account_lead: boolean
}

export type Project = {
  id: UUID
  client_id: UUID
  name: string
  type: ProjectType
  description: string | null
  health: HealthStatus
  health_reason: string | null
  start_date: DateString | null
  target_end_date: DateString | null
  default_revision_limit: number
  created_at: Timestamp
}

export type Milestone = {
  id: UUID
  project_id: UUID
  client_id: UUID
  title: string
  position: number
  due_date: DateString | null
  status: MilestoneStatus
  completed_at: Timestamp | null
  /** Completing this milestone raises an invoice. */
  invoice_trigger: boolean
}

export type Deliverable = {
  id: UUID
  project_id: UUID
  client_id: UUID
  milestone_id: UUID | null
  title: string
  kind: DeliverableKind
  status: DeliverableStatus
  current_version: number
  revision_limit: number
  revisions_used: number
  due_date: DateString | null
  /** instagram, youtube, ... for content deliverables. */
  platform: string | null
  caption: string | null
  approved_by: UUID | null
  approved_at: Timestamp | null
  approved_via: ApprovedVia | null
  created_at: Timestamp
}

export type Revision = {
  id: UUID
  deliverable_id: UUID
  client_id: UUID
  revision_number: number
  on_version: number
  description: string
  priority: RevisionPriority
  status: RevisionStatus
  counts_against_limit: boolean
  requested_by: UUID
  submitted_at: Timestamp
  delivered_at: Timestamp | null
}

/** `visibility: 'internal'` comments are staff-only and never reach a client. */
export type Comment = {
  id: UUID
  client_id: UUID
  project_id: UUID | null
  target_type: CommentTarget
  target_id: UUID
  author_id: UUID
  body: string
  visibility: Visibility
  created_at: Timestamp
}

/** Named FileRecord so it does not shadow the browser's `File`. Table: `files`. */
export type FileRecord = {
  id: UUID
  client_id: UUID
  project_id: UUID | null
  deliverable_id: UUID | null
  folder: FileFolder
  name: string
  mime_type: string | null
  size_bytes: number | null
  storage_key: string
  version: number
  uploaded_by: UUID | null
  visibility: Visibility
  created_at: Timestamp
}

export type ServiceRequest = {
  id: UUID
  client_id: UUID
  project_id: UUID | null
  title: string
  description: string | null
  status: ServiceRequestStatus
  quote_amount_minor: Minor | null
  requested_by: UUID | null
  created_at: Timestamp
}

export type Invoice = {
  id: UUID
  client_id: UUID
  project_id: UUID | null
  milestone_id: UUID | null
  number: string
  status: InvoiceStatus
  currency: 'INR'
  subtotal_minor: Minor
  cgst_minor: Minor
  sgst_minor: Minor
  igst_minor: Minor
  total_minor: Minor
  amount_paid_minor: Minor
  issue_date: DateString
  due_date: DateString
  paid_at: Timestamp | null
  created_at: Timestamp
}

export type InvoiceItem = {
  id: UUID
  invoice_id: UUID
  description: string
  sac_code: string | null
  quantity: number
  unit_price_minor: Minor
  amount_minor: Minor
}

/** Feeds the "Action Required" banner. Open while `resolved_at` is null. */
export type ActionItem = {
  id: UUID
  client_id: UUID
  project_id: UUID | null
  type: ActionItemType
  title: string
  ref_type: 'deliverable' | 'invoice' | 'service_request' | null
  ref_id: UUID | null
  assigned_user_id: UUID | null
  blocks_milestone: boolean
  due_at: Timestamp | null
  resolved_at: Timestamp | null
  created_at: Timestamp
}

/** CSAT answers and Founder Box messages. Founder Box rows are read by the founder only. */
export type Feedback = {
  id: UUID
  client_id: UUID
  kind: FeedbackKind
  founder_category: FounderCategory | null
  rating: number | null
  subject: string | null
  message: string | null
  status: FeedbackStatus
  submitted_by: UUID
  created_at: Timestamp
  responded_at: Timestamp | null
}

/** One row per client, platform and day. Primary key: (client_id, platform, date). */
export type SocialMetricDaily = {
  client_id: UUID
  project_id: UUID | null
  platform: string
  date: DateString
  followers: number
  reach: number
  impressions: number
  engagements: number
  profile_visits: number
  leads: number
}

/** Vernex's own sales pipeline. Staff-only: clients never see leads. */
export type Lead = {
  id: UUID
  name: string
  business: string | null
  phone_e164: string | null
  source: string | null
  status: LeadStatus
  created_at: Timestamp
}

export type Tables = {
  clients: Client
  profiles: Profile
  client_assignments: ClientAssignment
  projects: Project
  milestones: Milestone
  deliverables: Deliverable
  revisions: Revision
  comments: Comment
  files: FileRecord
  service_requests: ServiceRequest
  invoices: Invoice
  invoice_items: InvoiceItem
  action_items: ActionItem
  feedback: Feedback
  social_metrics_daily: SocialMetricDaily
  leads: Lead
}

// ---------------------------------------------------------------------------
// Write shapes
// ---------------------------------------------------------------------------

/** Columns the database fills in. */
type Generated = 'id' | 'created_at'

/** Insert shape: generated columns dropped, `Defaulted` columns optional. */
export type Insert<T, Defaulted extends keyof T = never> = Omit<T, Extract<Generated, keyof T> | Defaulted> &
  Partial<Pick<T, Defaulted>>

/** Update shape: any column except the generated ones and the tenant key. */
export type Update<T> = Partial<Omit<T, Extract<Generated | 'client_id', keyof T>>>

export type ClientInsert = Insert<
  Client,
  'logo_url' | 'industry' | 'city' | 'gstin' | 'billing_email' | 'currency' | 'retainer_minor' | 'retainer_months'
>
export type ProfileInsert = Insert<Profile, 'phone_e164' | 'avatar_url' | 'can_approve' | 'is_active'>
export type ProjectInsert = Insert<
  Project,
  'description' | 'health' | 'health_reason' | 'start_date' | 'target_end_date' | 'default_revision_limit'
>
export type MilestoneInsert = Insert<
  Milestone,
  'client_id' | 'position' | 'due_date' | 'status' | 'completed_at' | 'invoice_trigger'
>
export type DeliverableInsert = Pick<Deliverable, 'project_id' | 'title' | 'kind'> &
  Partial<Pick<Deliverable, 'milestone_id' | 'status' | 'revision_limit' | 'due_date' | 'platform' | 'caption'>>
export type InvoiceItemInsert = Pick<InvoiceItem, 'description' | 'unit_price_minor'> &
  Partial<Pick<InvoiceItem, 'sac_code' | 'quantity'>>
export type InvoiceInsert = Pick<Invoice, 'client_id' | 'issue_date' | 'due_date'> &
  Partial<Pick<Invoice, 'project_id' | 'milestone_id' | 'status'>> & { items: InvoiceItemInsert[] }
export type ActionItemInsert = Insert<
  ActionItem,
  'project_id' | 'ref_type' | 'ref_id' | 'assigned_user_id' | 'blocks_milestone' | 'due_at' | 'resolved_at'
>

export type InvoiceWithItems = Invoice & { items: InvoiceItem[] }
