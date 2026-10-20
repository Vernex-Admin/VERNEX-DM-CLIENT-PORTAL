import type {
  ActionItem,
  ActionItemInsert,
  Client,
  ClientAssignment,
  ClientInsert,
  Comment,
  CommentTarget,
  Deliverable,
  DeliverableInsert,
  DeliverableStatus,
  AiDraft,
  Feedback,
  FeedbackStatus,
  LeadActivity,
  Reminder,
  FileFolder,
  FileRecord,
  FounderCategory,
  Invoice,
  InvoiceInsert,
  InvoiceItemInsert,
  InvoiceWithItems,
  Lead,
  Milestone,
  MilestoneInsert,
  PreviewKind,
  Profile,
  ProfileInsert,
  Project,
  ProjectInsert,
  Revision,
  RevisionPriority,
  ServiceRequest,
  SocialMetricDaily,
  Update,
  Visibility,
  SocialPost,
  NotificationPrefs,
  DeliverableVersion,
  RevisionType,
  ClientDocument,
  MessageTemplate,
  OnboardingItem,
  ServiceType,
} from '../types/db'

// The contract every backend implements. The mock implements it today; a Supabase
// implementation replaces it later. Screens never import this folder: they go through
// src/lib/queries.
//
// Every method returns only the rows the signed-in user may see, and rejects with a
// DataError when they may not do something.

export type DataErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'signed_out'

export class DataError extends Error {
  readonly code: DataErrorCode

  constructor(code: DataErrorCode, message: string) {
    super(message)
    this.name = 'DataError'
    this.code = code
  }
}

export type ClientFilter = { client_id?: string }

/** Shaped like Supabase Auth so the real client can replace the mock. Errors reject with DataError. */
export type AuthUser = { id: string; email: string; user_metadata: { full_name: string } }
export type AuthSession = { user: AuthUser; expires_at: string }

export interface AuthRepo {
  getSession(): Promise<AuthSession | null>
  /** Realtime sign-in with email and password. */
  signInWithPassword(input: { email: string; password?: string }): Promise<AuthSession>
  /** Sends a sign-in link. Like Supabase, it does not reveal whether the email has an account. */
  signInWithOtp(input: { email: string }): Promise<void>
  /** Mock only: stands in for clicking the emailed link. Rejects when no link was sent to that email. */
  verifyOtp(input: { email: string }): Promise<AuthSession>
  /** Mock only: email stands in for the Google account chosen on Google's own screen. */
  signInWithOAuth(input: { provider: 'google'; email?: string }): Promise<AuthSession>
  signOut(): Promise<void>
  /**
   * Tells the app when a different person signs in or the session ends (including in another tab),
   * so it can refresh. Returns a function that stops listening. The mock never calls it.
   */
  onAuthChange(listener: (event: 'signed_in' | 'signed_out') => void): () => void
}

export interface SessionRepo {
  getCurrentProfile(): Promise<Profile | null>
  /** Development only: every seeded profile, for the user picker. */
  listSwitchableProfiles(): Promise<Profile[]>
  /** Development only: sign in as a seeded profile, or pass null to sign out. */
  switchProfile(profileId: string | null): Promise<Profile | null>
}

export interface ClientsRepo {
  list(): Promise<Client[]>
  get(id: string): Promise<Client>
  create(input: ClientInsert): Promise<Client>
  update(id: string, patch: Update<Client>): Promise<Client>
  remove(id: string): Promise<void>
}

export type MyProfilePatch = Partial<Pick<Profile, 'full_name' | 'phone_e164'>> & {
  notification_prefs?: NotificationPrefs
}

/** People: client users, and the Vernex staff assigned to a client. */
export interface ProfilesRepo {
  listByClient(clientId: string): Promise<Profile[]>
  /** The client's Vernex account lead, shown on the client dashboard. */
  getAccountLead(clientId: string): Promise<Profile | null>
  /** Staff only: every Vernex person, for choosing an account lead. */
  listStaff(): Promise<Profile[]>
  /** Staff only: which staff member leads each visible client. */
  listAccountLeads(): Promise<ClientAssignment[]>
  /** Staff only: makes `userId` the client's account lead (and assigns them if they were not). */
  setAccountLead(clientId: string, userId: string): Promise<ClientAssignment>
  /** Founder only: adds a Vernex PM. They sign in later with that email; there is no auth step. */
  createStaff(input: { email: string; full_name: string }): Promise<Profile>
  /** Founder only: switches a Vernex person off (or back on). They keep their history but cannot sign in. */
  setActive(id: string, isActive: boolean): Promise<Profile>
  /** Founder only: every client-to-staff assignment, leads included. */
  listAssignments(): Promise<ClientAssignment[]>
  /** Founder only: gives a PM access to a client. */
  assignToClient(clientId: string, userId: string): Promise<ClientAssignment>
  /** Founder only: removes a PM from a client. The account lead cannot be removed. */
  unassignFromClient(clientId: string, userId: string): Promise<void>
  createClientUser(input: ProfileInsert & { client_id: string }): Promise<Profile>
  /** The signed-in user edits their own name, WhatsApp number and notification choices. */
  updateMe(patch: MyProfilePatch): Promise<Profile>
  update(id: string, patch: Update<Profile>): Promise<Profile>
  remove(id: string): Promise<void>
}

export interface ProjectsRepo {
  list(filter?: ClientFilter): Promise<Project[]>
  get(id: string): Promise<Project>
  create(input: ProjectInsert): Promise<Project>
  update(id: string, patch: Update<Project>): Promise<Project>
  remove(id: string): Promise<void>
}

export interface MilestonesRepo {
  list(filter: { project_id: string }): Promise<Milestone[]>
  create(input: MilestoneInsert): Promise<Milestone>
  update(id: string, patch: Update<Milestone>): Promise<Milestone>
  remove(id: string): Promise<void>
  /** Sets positions 1..n in the order of `orderedIds`, which must be exactly the project's milestones. */
  reorder(projectId: string, orderedIds: string[]): Promise<Milestone[]>
}

export type DeliverableFilter = { client_id?: string; project_id?: string; status?: DeliverableStatus }

export type PublishVersion = {
  preview_kind: PreviewKind
  /** An uploaded file's URL or a Google Drive link. */
  preview_url: string
  /** Set to `client` to send it to the client for review. */
  visibility?: Visibility
  /** The file when it was uploaded rather than linked. Supabase stores it in the private vault. */
  file?: File
}

export interface DeliverablesRepo {
  list(filter?: DeliverableFilter): Promise<Deliverable[]>
  get(id: string): Promise<Deliverable>
  create(input: DeliverableInsert): Promise<Deliverable>
  update(id: string, patch: Update<Deliverable>): Promise<Deliverable>
  remove(id: string): Promise<void>
  /** Every uploaded version, oldest first. */
  listVersions(id: string): Promise<DeliverableVersion[]>
  /** Client approval of the version in review. */
  approve(id: string): Promise<Deliverable>
  /**
   * Staff upload the next version. A client-visible deliverable goes to `in_review` and the client
   * gets an approval action item; an internal one stays hidden from them.
   */
  publishVersion(id: string, input: PublishVersion): Promise<Deliverable>
}

export type RevisionRequest = {
  deliverable_id: string
  description: string
  priority?: RevisionPriority
  revision_type?: RevisionType
  attachment_names?: string[]
  /** One per form submission, so a double-click counts once. Made by the data layer if left out. */
  idempotency_key?: string
}

export interface RevisionsRepo {
  list(filter: { deliverable_id: string }): Promise<Revision[]>
  /** Client asks for changes: uses one revision and moves the deliverable to revision_requested. */
  request(input: RevisionRequest): Promise<Revision>
  update(id: string, patch: Update<Revision>): Promise<Revision>
  /** Staff add one revision to a deliverable's limit. The reason is required and logged. */
  grantBonus(input: { deliverable_id: string; reason: string }): Promise<Deliverable>
}

export type ServiceRequestSubmission = {
  client_id: string
  title: string
  description?: string
  project_id?: string
  desired_date?: string
  attachment_names?: string[]
}

export interface ServiceRequestsRepo {
  list(filter?: ClientFilter): Promise<ServiceRequest[]>
  submit(input: ServiceRequestSubmission): Promise<ServiceRequest>
  update(id: string, patch: Update<ServiceRequest>): Promise<ServiceRequest>
}

/** Invoice columns to change; pass `items` to replace the line items and recompute the totals. */
export type InvoicePatch = Update<Invoice> & { items?: InvoiceItemInsert[] }

export interface InvoicesRepo {
  list(filter?: ClientFilter): Promise<Invoice[]>
  get(id: string): Promise<InvoiceWithItems>
  /** Totals and GST are computed from the items. */
  create(input: InvoiceInsert): Promise<InvoiceWithItems>
  update(id: string, patch: InvoicePatch): Promise<Invoice>
  remove(id: string): Promise<void>
}

export type ActionItemFilter = { client_id?: string; open?: boolean }

export interface ActionItemsRepo {
  list(filter?: ActionItemFilter): Promise<ActionItem[]>
  create(input: ActionItemInsert): Promise<ActionItem>
  resolve(id: string): Promise<ActionItem>
  remove(id: string): Promise<void>
}

export type CommentFilter = { target_type: CommentTarget; target_id: string }
export type CommentInput = CommentFilter & { body: string; visibility?: Visibility }

export interface CommentsRepo {
  /** Internal comments are returned to staff only. */
  list(filter: CommentFilter): Promise<Comment[]>
  create(input: CommentInput): Promise<Comment>
}

export type FileFilter = { client_id: string; folder?: FileFolder }
export type BrandAssetUpload = {
  client_id: string
  name: string
  mime_type?: string
  size_bytes?: number
  /** Where the browser holds the file (an object URL); the mock keeps no file bodies. */
  url?: string
  /** The file itself. Supabase uploads it to the private vault; files over 50 MB are refused. */
  file?: File
}

/** A Google Drive (or other) link kept as a file row: nothing is uploaded. */
export type FileLinkInsert = {
  client_id: string
  folder: FileFolder
  name: string
  external_url: string
  visibility?: Visibility
}

export interface FilesRepo {
  list(filter: FileFilter): Promise<FileRecord[]>
  /** Records the upload in Brand Assets. The mock keeps metadata only. */
  uploadBrandAsset(input: BrandAssetUpload): Promise<FileRecord>
  /** Staff: records a Google Drive link in a folder. */
  addLink(input: FileLinkInsert): Promise<FileRecord>
  remove(id: string): Promise<void>
}

export type FounderMessage = {
  category: FounderCategory
  subject: string
  message: string
  private_from_team?: boolean
}

export interface FounderBoxRepo {
  /** A client user writes privately to the founder. */
  send(input: FounderMessage): Promise<Feedback>
  /** The sender's own past messages. */
  listMine(): Promise<Feedback[]>
  /** Founder only. */
  listInbox(): Promise<Feedback[]>
  /** Founder only: answers a message. A new message becomes acknowledged. */
  reply(id: string, text: string): Promise<Feedback>
  /** Founder only. */
  setStatus(id: string, status: FeedbackStatus): Promise<Feedback>
}

export type SocialMetricsFilter = { client_id: string; days?: number }
export type TopPostsFilter = { client_id: string; days?: number; limit?: number }

export interface SocialMetricsRepo {
  /** Oldest day first. Defaults to the last 30 days. */
  listDaily(filter: SocialMetricsFilter): Promise<SocialMetricDaily[]>
  /** Posts published in the range, highest reach first. */
  topPosts(filter: TopPostsFilter): Promise<SocialPost[]>
  /** The latest day that has numbers, or null when nothing has been synced yet. */
  lastSyncedAt(filter: { client_id: string }): Promise<string | null>
  /** Staff only: adds or replaces daily rows (one per client, platform and date). Returns how many. */
  importDaily(rows: SocialMetricImport[]): Promise<number>
}

export type SocialMetricImport = Omit<SocialMetricDaily, 'project_id'>

/** The columns a person fills in; everything else is set by the system. */
export type LeadInsert = Pick<Lead, 'company'> & Partial<Omit<Lead, 'id' | 'company' | 'created_at' | 'converted_client_id'>>

export interface LeadsRepo {
  /** Staff only. */
  list(): Promise<Lead[]>
  create(input: LeadInsert): Promise<Lead>
  /** Edits fields; a changed `stage` is logged as a stage move. */
  update(id: string, patch: Partial<LeadInsert>): Promise<Lead>
  remove(id: string): Promise<void>
  /** Oldest first. */
  listActivity(leadId: string): Promise<LeadActivity[]>
  /** Adds many leads at once, e.g. from a CSV. Rows without a company are rejected as a whole. */
  importMany(rows: LeadInsert[]): Promise<Lead[]>
  /** Closed Won only: creates the client from the lead and links the two. */
  convertToClient(id: string): Promise<Client>
}

export interface RemindersRepo {
  list(): Promise<Reminder[]>
  update(id: string, patch: Partial<Pick<Reminder, 'status'>>): Promise<Reminder>
}

export interface AiDraftsRepo {
  list(): Promise<AiDraft[]>
  /** Only a draft can be edited. */
  update(id: string, patch: Partial<Pick<AiDraft, 'title' | 'body'>>): Promise<AiDraft>
  /** draft to approved. */
  approve(id: string): Promise<AiDraft>
  /** approved to sent. */
  markSent(id: string): Promise<AiDraft>
}

export type ActivityKind = 'approval' | 'revision' | 'delivery' | 'comment' | 'file' | 'invoice'

/** One line of the dashboard activity feed. */
export type ActivityEvent = {
  id: string
  client_id: string
  kind: ActivityKind
  text: string
  at: string
  /** The deliverable the event is about, when there is one. */
  deliverable_id: string | null
}

export type ActivityFilter = { client_id?: string; limit?: number }

export interface ActivityRepo {
  /** Newest first. Never includes internal comments. */
  recent(filter?: ActivityFilter): Promise<ActivityEvent[]>
}

export type OnboardingGates = {
  agreement_signed: boolean
  first_invoice_paid: boolean
}

export type OnboardingItemPatch = Partial<Pick<OnboardingItem, 'status' | 'due_date' | 'title'>>

export interface OnboardingRepo {
  list(clientId: string): Promise<OnboardingItem[]>
  generate(clientId: string, service: ServiceType): Promise<OnboardingItem[]>
  updateItem(id: string, patch: OnboardingItemPatch): Promise<OnboardingItem>
  submit(answers: Record<string, unknown>, doneItemIds?: string[]): Promise<Client>
  gates(clientId: string): Promise<OnboardingGates>
}

export type DocumentInsert = Pick<ClientDocument, 'client_id' | 'kind' | 'title'> &
  Partial<Pick<ClientDocument, 'file_id' | 'external_url' | 'status' | 'sent_at' | 'signed_at'>> & {
    /** An uploaded file; Supabase stores it in the private vault and links it as `file_id`. */
    file?: File
  }

export type DocumentPatch = Partial<
  Pick<ClientDocument, 'kind' | 'title' | 'file_id' | 'external_url' | 'status' | 'sent_at' | 'signed_at'>
>

export interface DocumentsRepo {
  list(clientId: string): Promise<ClientDocument[]>
  create(input: DocumentInsert): Promise<ClientDocument>
  update(id: string, patch: DocumentPatch): Promise<ClientDocument>
  remove(id: string): Promise<void>
}

export type TemplatePatch = Partial<Pick<MessageTemplate, 'title' | 'subject' | 'body'>>

export interface TemplatesRepo {
  list(): Promise<MessageTemplate[]>
  update(id: string, patch: TemplatePatch): Promise<MessageTemplate>
}

export interface DataLayer {
  auth: AuthRepo
  session: SessionRepo
  clients: ClientsRepo
  profiles: ProfilesRepo
  projects: ProjectsRepo
  milestones: MilestonesRepo
  deliverables: DeliverablesRepo
  revisions: RevisionsRepo
  serviceRequests: ServiceRequestsRepo
  invoices: InvoicesRepo
  actionItems: ActionItemsRepo
  comments: CommentsRepo
  files: FilesRepo
  founderBox: FounderBoxRepo
  socialMetrics: SocialMetricsRepo
  leads: LeadsRepo
  reminders: RemindersRepo
  aiDrafts: AiDraftsRepo
  activity: ActivityRepo
  onboarding: OnboardingRepo
  documents: DocumentsRepo
  templates: TemplatesRepo
}

