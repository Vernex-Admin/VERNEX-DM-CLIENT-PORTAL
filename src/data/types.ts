import type {
  ActionItem,
  ActionItemInsert,
  Client,
  ClientInsert,
  Comment,
  CommentTarget,
  Deliverable,
  DeliverableInsert,
  DeliverableStatus,
  Feedback,
  FileFolder,
  FileRecord,
  FounderCategory,
  Invoice,
  InvoiceInsert,
  InvoiceWithItems,
  Lead,
  Milestone,
  MilestoneInsert,
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

/** People: client users, and the Vernex staff assigned to a client. */
export interface ProfilesRepo {
  listByClient(clientId: string): Promise<Profile[]>
  /** The client's Vernex account lead, shown on the client dashboard. */
  getAccountLead(clientId: string): Promise<Profile | null>
  createClientUser(input: ProfileInsert & { client_id: string }): Promise<Profile>
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
}

export type DeliverableFilter = { client_id?: string; project_id?: string; status?: DeliverableStatus }

export interface DeliverablesRepo {
  list(filter?: DeliverableFilter): Promise<Deliverable[]>
  get(id: string): Promise<Deliverable>
  create(input: DeliverableInsert): Promise<Deliverable>
  update(id: string, patch: Update<Deliverable>): Promise<Deliverable>
  remove(id: string): Promise<void>
  /** Client approval of the version in review. */
  approve(id: string): Promise<Deliverable>
}

export type RevisionRequest = { deliverable_id: string; description: string; priority?: RevisionPriority }

export interface RevisionsRepo {
  list(filter: { deliverable_id: string }): Promise<Revision[]>
  /** Client asks for changes: uses one revision and moves the deliverable to revision_requested. */
  request(input: RevisionRequest): Promise<Revision>
  update(id: string, patch: Update<Revision>): Promise<Revision>
}

export type ServiceRequestSubmission = { client_id: string; title: string; description?: string; project_id?: string }

export interface ServiceRequestsRepo {
  list(filter?: ClientFilter): Promise<ServiceRequest[]>
  submit(input: ServiceRequestSubmission): Promise<ServiceRequest>
  update(id: string, patch: Update<ServiceRequest>): Promise<ServiceRequest>
}

export interface InvoicesRepo {
  list(filter?: ClientFilter): Promise<Invoice[]>
  get(id: string): Promise<InvoiceWithItems>
  /** Totals and GST are computed from the items. */
  create(input: InvoiceInsert): Promise<InvoiceWithItems>
  update(id: string, patch: Update<Invoice>): Promise<Invoice>
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
export type BrandAssetUpload = { client_id: string; name: string; mime_type?: string; size_bytes?: number }

export interface FilesRepo {
  list(filter: FileFilter): Promise<FileRecord[]>
  /** Records the upload in Brand Assets. The mock keeps metadata only. */
  uploadBrandAsset(input: BrandAssetUpload): Promise<FileRecord>
  remove(id: string): Promise<void>
}

export type FounderMessage = { category: FounderCategory; subject: string; message: string }

export interface FounderBoxRepo {
  /** A client user writes privately to the founder. */
  send(input: FounderMessage): Promise<Feedback>
  /** The sender's own past messages. */
  listMine(): Promise<Feedback[]>
  /** Founder only. */
  listInbox(): Promise<Feedback[]>
}

export type SocialMetricsFilter = { client_id: string; days?: number }

export interface SocialMetricsRepo {
  /** Oldest day first. Defaults to the last 30 days. */
  listDaily(filter: SocialMetricsFilter): Promise<SocialMetricDaily[]>
}

export interface LeadsRepo {
  /** Staff only. */
  list(): Promise<Lead[]>
}

export interface DataLayer {
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
}
