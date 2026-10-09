import type { Tone } from '../components/ui/tone'
import type {
  DeliverableKind,
  DeliverableStatus,
  FounderCategory,
  HealthStatus,
  InvoiceStatus,
  MilestoneStatus,
  ProjectType,
  RevisionStatus,
  RevisionType,
  ServiceRequestStatus,
  UserRole,
} from '../types/db'

export const HEALTH_STATUS: Record<HealthStatus, { label: string; tone: Tone }> = {
  on_track: { label: 'On track', tone: 'ok' },
  in_review: { label: 'In review', tone: 'warn' },
  blocked: { label: 'Blocked', tone: 'bad' },
  completed: { label: 'Completed', tone: 'neutral' },
}

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  vernex_founder: 'Founder',
  vernex_pm: 'Project manager',
  client_admin: 'Client admin',
  client_member: 'Client member',
}

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  software: 'Software',
  web: 'Website',
  erp: 'ERP',
  automation: 'Automation',
  social_media: 'Social media',
  video: 'Video',
  performance_marketing: 'Performance marketing',
  branding: 'Branding',
  consulting: 'Consulting',
}

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  upcoming: 'Upcoming',
  current: 'Current',
  done: 'Done',
  blocked: 'Blocked',
}

export const DELIVERABLE_KIND_LABEL: Record<DeliverableKind, string> = {
  video: 'Video',
  image: 'Image',
  design: 'Design',
  document: 'Document',
  post: 'Post',
  ad_creative: 'Ad creative',
  web_page: 'Web page',
  software_build: 'Software build',
  report: 'Report',
}

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Due', tone: 'info' },
  viewed: { label: 'Due', tone: 'info' },
  partially_paid: { label: 'Partly paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'ok' },
  overdue: { label: 'Overdue', tone: 'bad' },
  void: { label: 'Cancelled', tone: 'neutral' },
}

export const SERVICE_REQUEST_STATUS: Record<ServiceRequestStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Sent to Vernex', tone: 'info' },
  estimating: { label: 'Being priced', tone: 'info' },
  quoted: { label: 'Quote ready', tone: 'warn' },
  negotiating: { label: 'Talking it through', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'ok' },
  declined: { label: 'Declined', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'ok' },
}

export const FOUNDER_CATEGORY_LABEL: Record<FounderCategory, string> = {
  praise: 'Praise',
  concern: 'Concern',
  complaint: 'Complaint',
  idea: 'Idea',
  escalation: 'Escalation',
}

export const DELIVERABLE_STATUS: Record<DeliverableStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  in_review: { label: 'Waiting on you', tone: 'warn' },
  revision_requested: { label: 'Changes requested', tone: 'info' },
  approved: { label: 'Approved', tone: 'ok' },
  blocked: { label: 'On hold', tone: 'bad' },
  archived: { label: 'Archived', tone: 'neutral' },
}

export const REVISION_TYPE_LABEL: Record<RevisionType, string> = {
  copy_text: 'Copy / text',
  visual_design: 'Visual / design',
  video_cut: 'Video cut / timing',
  audio_music: 'Audio / music',
  functionality: 'Functionality',
  bug_fix: 'Bug fix',
  content_data: 'Content / data',
  other: 'Other',
}

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  submitted: 'Sent to Vernex',
  accepted: 'Accepted',
  in_progress: 'Being worked on',
  delivered: 'Delivered',
  rejected_out_of_scope: 'Needs a quote',
}

