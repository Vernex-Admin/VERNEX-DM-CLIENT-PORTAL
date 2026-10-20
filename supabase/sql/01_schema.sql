-- Vernex Hub: 01 schema
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Run each file once, in order 01..06.
-- Tables and columns match src/types/db.ts. Onboarding tables come from the Onboarding Playbook.
-- Money is in paise (bigint). Text1 columns with a CHECK list stand in for enums.

begin;

-- ---------------------------------------------------------------------------
-- Tenants and people
-- ---------------------------------------------------------------------------

create table public.clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) > 0),
  slug               text not null unique,
  logo_url           text,
  industry           text,
  city               text,
  gstin              text,
  billing_email      text,
  currency           text not null default 'INR' check (currency = 'INR'),
  retainer_minor     bigint check (retainer_minor >= 0),
  retainer_months    int check (retainer_months > 0),
  -- Onboarding (playbook): which checklist this client gets, and their setup-form answers.
  service_type       text check (service_type in ('social', 'website', 'both')),
  onboarding_answers jsonb,
  created_at         timestamptz not null default now()
);

-- A person. Staff have no client_id; client users must have one.
-- profiles.id is the id the app uses everywhere. user_id links to Supabase Auth and is
-- filled in automatically the first time that email signs in (see 02_security.sql).
create table public.profiles (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references auth.users (id) on delete set null,
  client_id          uuid references public.clients (id) on delete cascade,
  email              text not null,
  full_name          text not null default '',
  phone_e164         text,
  avatar_url         text,
  role               text not null check (role in ('vernex_founder', 'vernex_pm', 'client_admin', 'client_member')),
  can_approve        boolean not null default false,
  is_active          boolean not null default true,
  notification_prefs jsonb not null default
    '{"email":true,"whatsapp":true,"approvals":true,"comments":true,"invoices":true,"weekly_report":false}',
  created_at         timestamptz not null default now(),
  constraint profiles_role_client check (
    (role in ('client_admin', 'client_member') and client_id is not null)
    or (role in ('vernex_founder', 'vernex_pm') and client_id is null)
  )
);
create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_client_idx on public.profiles (client_id);

create table public.client_assignments (
  client_id       uuid not null references public.clients (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  is_account_lead boolean not null default false,
  primary key (client_id, user_id)
);
create unique index one_account_lead_per_client on public.client_assignments (client_id) where is_account_lead;
create index client_assignments_user_idx on public.client_assignments (user_id);

-- ---------------------------------------------------------------------------
-- Projects and delivery
-- ---------------------------------------------------------------------------

create table public.projects (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients (id) on delete cascade,
  name                   text not null,
  type                   text not null check (type in ('software', 'web', 'erp', 'automation', 'social_media', 'video',
                                                       'performance_marketing', 'branding', 'consulting')),
  description            text,
  health                 text not null default 'on_track' check (health in ('on_track', 'in_review', 'blocked', 'completed')),
  health_reason          text,
  start_date             date,
  target_end_date        date,
  default_revision_limit int not null default 3 check (default_revision_limit >= 0),
  created_at             timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);

create table public.milestones (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  title           text not null,
  position        int not null default 0,
  due_date        date,
  status          text not null default 'upcoming' check (status in ('upcoming', 'current', 'done', 'blocked')),
  completed_at    timestamptz,
  invoice_trigger boolean not null default false
);
create index milestones_project_idx on public.milestones (project_id, position);

create table public.deliverables (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  client_id        uuid not null references public.clients (id) on delete cascade,
  milestone_id     uuid references public.milestones (id) on delete set null,
  title            text not null,
  kind             text not null check (kind in ('video', 'image', 'design', 'document', 'post', 'ad_creative',
                                                  'web_page', 'software_build', 'report')),
  status           text not null default 'draft' check (status in ('draft', 'in_progress', 'in_review',
                                                  'revision_requested', 'approved', 'blocked', 'archived')),
  current_version  int not null default 1 check (current_version >= 0),
  revision_limit   int not null default 3 check (revision_limit >= 0),
  revisions_used   int not null default 0 check (revisions_used >= 0),
  due_date         date,
  platform         text,
  caption          text,
  approved_by      uuid references public.profiles (id) on delete set null,
  approved_at      timestamptz,
  approved_via     text check (approved_via in ('portal', 'offline_proxy')),
  is_final         boolean not null default false,
  bulk_approvable  boolean not null default false,
  thumbnail_url    text,
  visibility       text not null default 'internal' check (visibility in ('internal', 'client')),
  created_at       timestamptz not null default now()
);
create index deliverables_client_status_idx on public.deliverables (client_id, status);
create index deliverables_project_idx on public.deliverables (project_id);

create table public.deliverable_versions (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  version        int not null,
  preview_kind   text not null check (preview_kind in ('image', 'pdf', 'video', 'drive')),
  preview_url    text not null,
  created_at     timestamptz not null default now(),
  unique (deliverable_id, version)
);

create table public.revisions (
  id                   uuid primary key default gen_random_uuid(),
  deliverable_id       uuid not null references public.deliverables (id) on delete cascade,
  client_id            uuid not null references public.clients (id) on delete cascade,
  revision_number      int not null,
  on_version           int not null,
  revision_type        text not null default 'other' check (revision_type in ('copy_text', 'visual_design', 'video_cut',
                         'audio_music', 'functionality', 'bug_fix', 'content_data', 'other')),
  description          text not null,
  attachment_names     text[] not null default '{}',
  priority             text not null default 'normal' check (priority in ('normal', 'urgent')),
  status               text not null default 'submitted' check (status in ('submitted', 'accepted', 'in_progress',
                         'delivered', 'rejected_out_of_scope')),
  counts_against_limit boolean not null default true,
  requested_by         uuid not null references public.profiles (id),
  submitted_at         timestamptz not null default now(),
  delivered_at         timestamptz,
  idempotency_key      text unique,
  unique (deliverable_id, revision_number)
);

create table public.revision_grants (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  reason         text not null,
  granted_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now()
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  target_type text not null check (target_type in ('deliverable', 'file', 'project', 'service_request')),
  target_id   uuid not null,
  author_id   uuid not null references public.profiles (id),
  body        text not null check (length(trim(body)) > 0),
  visibility  text not null default 'client' check (visibility in ('internal', 'client')),
  created_at  timestamptz not null default now()
);
create index comments_target_idx on public.comments (target_type, target_id, created_at);

create table public.files (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete set null,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  folder         text not null check (folder in ('brand_assets', 'raw_video', 'rendered_ads', 'software_builds',
                                                  'documents', 'invoices')),
  name           text not null,
  mime_type      text,
  size_bytes     bigint,
  -- Path inside the private "vault" storage bucket: clients/<client_id>/<folder>/<file name>
  storage_key    text not null default '',
  url            text,
  external_url   text,
  version        int not null default 1,
  uploaded_by    uuid references public.profiles (id) on delete set null,
  visibility     text not null default 'client' check (visibility in ('internal', 'client')),
  created_at     timestamptz not null default now()
);
create index files_client_folder_idx on public.files (client_id, folder);
create index files_storage_key_idx on public.files (storage_key);

create table public.service_requests (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id) on delete cascade,
  project_id         uuid references public.projects (id) on delete set null,
  title              text not null,
  description        text,
  status             text not null default 'submitted' check (status in ('submitted', 'estimating', 'quoted',
                       'negotiating', 'accepted', 'declined', 'scheduled')),
  quote_amount_minor bigint,
  desired_date       date,
  attachment_names   text[] not null default '{}',
  requested_by       uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

create sequence public.invoice_number_seq;

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  project_id        uuid references public.projects (id) on delete set null,
  milestone_id      uuid references public.milestones (id) on delete set null,
  -- Filled by trigger if left empty: VX/26-27/0001 (Indian financial year).
  number            text not null default '' unique,
  status            text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'partially_paid',
                      'paid', 'overdue', 'void')),
  currency          text not null default 'INR' check (currency = 'INR'),
  subtotal_minor    bigint not null default 0,
  cgst_minor        bigint not null default 0,
  sgst_minor        bigint not null default 0,
  igst_minor        bigint not null default 0,
  total_minor       bigint not null default 0,
  amount_paid_minor bigint not null default 0,
  issue_date        date not null default current_date,
  due_date          date not null,
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index invoices_client_idx on public.invoices (client_id, status);

create table public.invoice_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices (id) on delete cascade,
  description      text not null,
  sac_code         text,
  quantity         numeric(10, 2) not null default 1,
  unit_price_minor bigint not null,
  amount_minor     bigint not null
);

-- ---------------------------------------------------------------------------
-- Dashboard, feedback, metrics
-- ---------------------------------------------------------------------------

create table public.action_items (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  project_id       uuid references public.projects (id) on delete cascade,
  type             text not null check (type in ('approval', 'revision_response', 'missing_asset', 'invoice_due',
                      'info_request', 'meeting_confirm', 'quote_acceptance')),
  title            text not null,
  ref_type         text check (ref_type in ('deliverable', 'invoice', 'service_request')),
  ref_id           uuid,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  blocks_milestone boolean not null default false,
  due_at           timestamptz,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index action_items_open_idx on public.action_items (client_id) where resolved_at is null;

create table public.feedback (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  kind              text not null check (kind in ('csat', 'founder_box')),
  founder_category  text check (founder_category in ('praise', 'concern', 'complaint', 'idea', 'escalation')),
  rating            int check (rating between 1 and 5),
  subject           text,
  message           text,
  private_from_team boolean not null default true,
  status            text not null default 'new' check (status in ('new', 'acknowledged', 'in_progress', 'resolved')),
  submitted_by      uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,
  reply             text
);

create table public.social_metrics_daily (
  client_id      uuid not null references public.clients (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete set null,
  platform       text not null,
  date           date not null,
  followers      int not null default 0,
  reach          int not null default 0,
  impressions    int not null default 0,
  engagements    int not null default 0,
  profile_visits int not null default 0,
  leads          int not null default 0,
  ad_spend_minor bigint not null default 0,
  primary key (client_id, platform, date)
);

create table public.social_posts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  platform     text not null,
  title        text not null,
  published_at timestamptz not null,
  reach        int not null default 0,
  engagements  int not null default 0
);
create index social_posts_client_idx on public.social_posts (client_id, published_at desc);

-- ---------------------------------------------------------------------------
-- Vernex internal (staff only)
-- ---------------------------------------------------------------------------

create table public.leads (
  id                   uuid primary key default gen_random_uuid(),
  stage                text not null default 'new_lead' check (stage in ('new_lead', 'researched', 'qualified',
                         'outreach_sent', 'responded', 'discovery_call', 'qualified_opportunity', 'proposal',
                         'negotiation', 'closed_won', 'closed_lost')),
  company              text not null,
  country              text,
  city                 text,
  industry             text,
  website              text,
  instagram            text,
  linkedin             text,
  decision_maker       text,
  role                 text,
  email                text,
  phone_e164           text,
  score                int check (score between 0 and 100),
  tier                 text check (tier in ('A', 'B', 'C')),
  problem              text,
  opportunity          text,
  recommended_offer    text,
  monthly_budget_minor bigint,
  next_action          text,
  follow_up_date       date,
  notes                text,
  converted_client_id  uuid references public.clients (id) on delete set null,
  created_at           timestamptz not null default now()
);

create table public.lead_activity (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  kind       text not null check (kind in ('created', 'stage', 'edit', 'converted', 'imported')),
  text       text not null,
  by         uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.reminders (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references public.clients (id) on delete cascade,
  recipient_name text not null,
  phone_e164     text not null,
  message        text not null,
  reason         text not null,
  due_at         timestamptz not null,
  status         text not null default 'queued' check (status in ('queued', 'sent', 'skipped')),
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);

create table public.ai_drafts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('weekly_summary', 'outreach')),
  title      text not null,
  subject    text not null,
  body       text not null,
  status     text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Onboarding (from the Onboarding Playbook)
-- ---------------------------------------------------------------------------

-- The master checklist. generate_onboarding() copies the matching rows to a client.
create table public.onboarding_item_templates (
  id              uuid primary key default gen_random_uuid(),
  service         text not null check (service in ('common', 'social', 'website')),
  stage           text not null,
  title           text not null,
  owner           text not null check (owner in ('vernex', 'client')),
  position        int not null default 0,
  due_offset_days int not null default 7
);

create table public.onboarding_items (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  service      text not null check (service in ('common', 'social', 'website')),
  stage        text not null,
  title        text not null,
  owner        text not null check (owner in ('vernex', 'client')),
  status       text not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  position     int not null default 0,
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index onboarding_items_client_idx on public.onboarding_items (client_id, position);

-- Proposals and agreements. Clients see them once sent; never drafts.
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  kind         text not null check (kind in ('proposal', 'agreement', 'other')),
  title        text not null,
  file_id      uuid references public.files (id) on delete set null,
  external_url text,
  status       text not null default 'draft' check (status in ('draft', 'sent', 'signed')),
  sent_at      timestamptz,
  signed_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index documents_client_idx on public.documents (client_id);

-- The 11 playbook messages. Body uses {{merge_fields}}.
create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  title      text not null,
  channel    text not null check (channel in ('whatsapp', 'email')),
  subject    text,
  body       text not null,
  position   int not null default 0,
  updated_at timestamptz not null default now()
);

commit;
