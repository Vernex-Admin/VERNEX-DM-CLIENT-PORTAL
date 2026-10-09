import type {
  ActionItem,
  AiDraft,
  Client,
  ClientAssignment,
  Comment,
  Deliverable,
  DeliverableVersion,
  Feedback,
  FileRecord,
  Invoice,
  InvoiceItem,
  Lead,
  LeadActivity,
  Reminder,
  Milestone,
  Profile,
  Project,
  Revision,
  ServiceRequest,
  SocialMetricDaily,
  SocialPost,
  Tables,
} from '../../types/db'

// Seed data for the mock data layer.
//
// GIVEN by the brief: the two client names, AGK Fitness's city, industry and retainer
// (INR 15,000 a month for 6 months), and the founder's name (Boss Anandaa).
// PLACEHOLDERS, invented here and safe to replace: every other person's name, all emails
// and phone numbers, Raack Dance Academy's city and retainer, GSTINs, project names,
// deliverable titles, invoice numbers and amounts other than the AGK retainer, and leads.
//
// Dates are relative to today so the data never looks stale.

const DAY_MS = 86_400_000
const now = Date.now()

/** Calendar date `offset` days from today. */
const day = (offset: number) => new Date(now + offset * DAY_MS).toISOString().slice(0, 10)
/** Timestamp `offset` days from now. */
const at = (offset: number) => new Date(now + offset * DAY_MS).toISOString()

export const SEED_IDS = {
  founder: 'u-founder',
  pm: 'u-pm',
  agk: 'c-agk',
  agkAdmin: 'u-agk-admin',
  agkMember: 'u-agk-member',
  raack: 'c-raack',
  raackAdmin: 'u-raack-admin',
  raackMember: 'u-raack-member',
} as const

const { founder, pm, agk, agkAdmin, agkMember, raack, raackAdmin, raackMember } = SEED_IDS

const rupees = (amount: number) => amount * 100

function clients(): Client[] {
  return [
    {
      id: agk,
      name: 'AGK Fitness',
      slug: 'agk-fitness',
      logo_url: null,
      industry: 'Fitness',
      city: 'Chennai',
      gstin: '33AAAAA0000A1Z5',
      billing_email: 'accounts@agkfitness.example',
      currency: 'INR',
      retainer_minor: rupees(15_000),
      retainer_months: 6,
      created_at: at(-75),
    },
    {
      id: raack,
      name: 'Raack Dance Academy',
      slug: 'raack-dance-academy',
      logo_url: null,
      industry: 'Dance academy',
      city: 'Chennai',
      gstin: '33BBBBB0000B1Z3',
      billing_email: 'office@raackdance.example',
      currency: 'INR',
      retainer_minor: rupees(12_000),
      retainer_months: 3,
      created_at: at(-48),
    },
  ]
}

function profiles(): Profile[] {
  const person = (
    id: string,
    full_name: string,
    email: string,
    role: Profile['role'],
    client_id: string | null,
    phone: string,
    can_approve = false,
  ): Profile => ({
    id,
    client_id,
    email,
    full_name,
    phone_e164: phone,
    avatar_url: null,
    role,
    can_approve,
    is_active: true,
    notification_prefs: { email: true, whatsapp: true, approvals: true, comments: true, invoices: true, weekly_report: false },
    created_at: at(-75),
  })

  return [
    person(founder, 'Boss Anandaa', 'anandaa@vernex.example', 'vernex_founder', null, '+919000000001'),
    person(pm, 'Karthik Raj', 'karthik@vernex.example', 'vernex_pm', null, '+919000000002'),
    person(agkAdmin, 'Arun Kumar', 'arun@agkfitness.example', 'client_admin', agk, '+919000000011', true),
    // Cannot approve: use this profile to test the can_approve rule.
    person(agkMember, 'Divya Shankar', 'divya@agkfitness.example', 'client_member', agk, '+919000000012', false),
    person(raackAdmin, 'Meena Raghavan', 'meena@raackdance.example', 'client_admin', raack, '+919000000021', true),
    // Can approve: the client admin has switched it on.
    person(raackMember, 'Sanjay Ravi', 'sanjay@raackdance.example', 'client_member', raack, '+919000000022', true),
  ]
}

function clientAssignments(): ClientAssignment[] {
  return [
    { client_id: agk, user_id: pm, is_account_lead: true },
    { client_id: raack, user_id: pm, is_account_lead: true },
  ]
}

function projects(): Project[] {
  return [
    {
      id: 'p-agk-social',
      client_id: agk,
      name: 'Monthly social media',
      type: 'social_media',
      description: 'Reels, posts and stories for Instagram, 12 pieces a month.',
      health: 'in_review',
      health_reason: 'October reel is waiting for approval.',
      start_date: day(-75),
      target_end_date: day(105),
      default_revision_limit: 3,
      created_at: at(-75),
    },
    {
      id: 'p-agk-web',
      client_id: agk,
      name: 'Membership website',
      type: 'web',
      description: 'New website with class timetable and membership enquiry.',
      health: 'on_track',
      health_reason: null,
      start_date: day(-30),
      target_end_date: day(25),
      default_revision_limit: 2,
      created_at: at(-30),
    },
    {
      id: 'p-raack-admissions',
      client_id: raack,
      name: 'Admissions campaign 2026-27',
      type: 'performance_marketing',
      description: 'Posters, reels and ads for the new batch admissions.',
      health: 'on_track',
      health_reason: null,
      start_date: day(-48),
      target_end_date: day(42),
      default_revision_limit: 2,
      created_at: at(-48),
    },
    {
      id: 'p-raack-film',
      client_id: raack,
      name: 'Annual day showcase film',
      type: 'video',
      description: 'A 30-second teaser and the full annual day film.',
      health: 'blocked',
      health_reason: 'Waiting on rehearsal footage from the academy.',
      start_date: day(-20),
      target_end_date: day(35),
      default_revision_limit: 2,
      created_at: at(-20),
    },
  ]
}

function milestones(): Milestone[] {
  const row = (
    id: string,
    project_id: string,
    client_id: string,
    position: number,
    title: string,
    status: Milestone['status'],
    due: number,
    invoice_trigger = false,
  ): Milestone => ({
    id,
    project_id,
    client_id,
    title,
    position,
    due_date: day(due),
    status,
    completed_at: status === 'done' ? at(due) : null,
    invoice_trigger,
  })

  return [
    row('m-agk-social-1', 'p-agk-social', agk, 1, 'September content delivered', 'done', -12, true),
    row('m-agk-social-2', 'p-agk-social', agk, 2, 'October content approved', 'current', 6, true),
    row('m-agk-social-3', 'p-agk-social', agk, 3, 'November calendar signed off', 'upcoming', 20),
    row('m-agk-web-1', 'p-agk-web', agk, 1, 'Sitemap and content collected', 'done', -18),
    row('m-agk-web-2', 'p-agk-web', agk, 2, 'Page designs approved', 'current', 4, true),
    row('m-agk-web-3', 'p-agk-web', agk, 3, 'Website live', 'upcoming', 25, true),
    row('m-raack-adm-1', 'p-raack-admissions', raack, 1, 'Campaign plan agreed', 'done', -40),
    row('m-raack-adm-2', 'p-raack-admissions', raack, 2, 'Creatives approved', 'current', 5),
    row('m-raack-adm-3', 'p-raack-admissions', raack, 3, 'Ads running', 'upcoming', 12, true),
    row('m-raack-film-1', 'p-raack-film', raack, 1, 'Rehearsal footage received', 'blocked', -3),
    row('m-raack-film-2', 'p-raack-film', raack, 2, 'Teaser approved', 'upcoming', 10, true),
    row('m-raack-film-3', 'p-raack-film', raack, 3, 'Full film delivered', 'upcoming', 35, true),
  ]
}

function deliverables(): Deliverable[] {
  const row = (
    base: Pick<Deliverable, 'id' | 'project_id' | 'client_id' | 'milestone_id' | 'title' | 'kind' | 'status'> &
      Partial<Deliverable>,
    due: number,
  ): Deliverable => ({
    current_version: 1,
    revision_limit: 3,
    revisions_used: 0,
    due_date: day(due),
    platform: null,
    caption: null,
    approved_by: null,
    approved_at: null,
    approved_via: null,
    is_final: false,
    bulk_approvable: false,
    thumbnail_url: null,
    visibility: 'client',
    created_at: at(due - 10),
    ...base,
  })

  return [
    // AGK Fitness: 6 deliverables
    row(
      {
        id: 'd-agk-1',
        project_id: 'p-agk-social',
        client_id: agk,
        milestone_id: 'm-agk-social-2',
        title: 'October reel: 5 AM batch transformation',
        kind: 'video',
        status: 'in_review',
        current_version: 2,
        revisions_used: 1,
        platform: 'instagram',
        caption: 'Three months. 5 AM. No excuses. Batch starts 1 November.',
      },
      2,
    ),
    row(
      {
        id: 'd-agk-2',
        project_id: 'p-agk-social',
        client_id: agk,
        milestone_id: 'm-agk-social-2',
        title: 'Navratri offer carousel',
        kind: 'post',
        status: 'approved',
        platform: 'instagram',
        approved_by: agkAdmin,
        approved_at: at(-4),
        approved_via: 'portal',
      },
      -3,
    ),
    row(
      {
        id: 'd-agk-3',
        project_id: 'p-agk-social',
        client_id: agk,
        milestone_id: 'm-agk-social-2',
        title: 'Trainer spotlight: Coach Vignesh',
        kind: 'post',
        status: 'revision_requested',
        revisions_used: 1,
        platform: 'instagram',
      },
      3,
    ),
    row(
      {
        id: 'd-agk-4',
        project_id: 'p-agk-social',
        client_id: agk,
        milestone_id: 'm-agk-social-3',
        title: 'November content calendar',
        kind: 'document',
        status: 'in_progress',
      },
      14,
    ),
    row(
      {
        id: 'd-agk-5',
        project_id: 'p-agk-web',
        client_id: agk,
        milestone_id: 'm-agk-web-2',
        title: 'Membership page design',
        kind: 'web_page',
        status: 'in_review',
        revision_limit: 2,
        is_final: true,
      },
      4,
    ),
    row(
      {
        id: 'd-agk-6',
        project_id: 'p-agk-web',
        client_id: agk,
        milestone_id: 'm-agk-web-2',
        title: 'Class timetable page',
        kind: 'web_page',
        status: 'draft',
        revision_limit: 2,
      },
      9,
    ),

    // Two more posts in review, flagged so the Approvals inbox can approve them together.
    row(
      {
        id: 'd-agk-7',
        project_id: 'p-agk-social',
        client_id: agk,
        milestone_id: 'm-agk-social-2',
        title: 'Gym timings story set',
        kind: 'post',
        status: 'in_review',
        bulk_approvable: true,
        platform: 'instagram',
      },
      -2,
    ),
    row(
      {
        id: 'd-agk-8',
        project_id: 'p-agk-social',
        client_id: agk,
        milestone_id: 'm-agk-social-2',
        title: 'Diwali membership offer poster',
        kind: 'post',
        status: 'in_review',
        bulk_approvable: true,
        platform: 'instagram',
      },
      5,
    ),

    // Raack Dance Academy: 6 deliverables
    row(
      {
        id: 'd-raack-1',
        project_id: 'p-raack-admissions',
        client_id: raack,
        milestone_id: 'm-raack-adm-2',
        title: 'Admissions open: Bharatanatyam batch poster',
        kind: 'image',
        status: 'in_review',
        revision_limit: 2,
        bulk_approvable: true,
        platform: 'instagram',
      },
      1,
    ),
    row(
      {
        id: 'd-raack-2',
        project_id: 'p-raack-admissions',
        client_id: raack,
        milestone_id: 'm-raack-adm-2',
        title: 'Student testimonial reel',
        kind: 'video',
        status: 'approved',
        current_version: 2,
        revision_limit: 2,
        revisions_used: 1,
        platform: 'instagram',
        approved_by: raackMember,
        approved_at: at(-6),
        approved_via: 'portal',
      },
      -5,
    ),
    row(
      {
        // Both revisions used: a third request is refused and should become a service request.
        id: 'd-raack-3',
        project_id: 'p-raack-admissions',
        client_id: raack,
        milestone_id: 'm-raack-adm-2',
        title: 'Free trial class ad set',
        kind: 'ad_creative',
        status: 'revision_requested',
        current_version: 2,
        revision_limit: 2,
        revisions_used: 2,
        platform: 'instagram',
      },
      3,
    ),
    row(
      {
        id: 'd-raack-4',
        project_id: 'p-raack-film',
        client_id: raack,
        milestone_id: 'm-raack-film-2',
        title: 'Annual day teaser (30 seconds)',
        kind: 'video',
        status: 'blocked',
        revision_limit: 2,
        platform: 'youtube',
      },
      10,
    ),
    row(
      {
        id: 'd-raack-5',
        project_id: 'p-raack-film',
        client_id: raack,
        milestone_id: 'm-raack-film-3',
        title: 'Annual day full film',
        kind: 'video',
        status: 'draft',
        revision_limit: 2,
        platform: 'youtube',
      },
      35,
    ),
    row(
      {
        id: 'd-raack-6',
        project_id: 'p-raack-admissions',
        client_id: raack,
        milestone_id: 'm-raack-adm-3',
        title: 'Admissions landing page copy',
        kind: 'document',
        status: 'in_progress',
        revision_limit: 2,
      },
      8,
    ),
  ]
}

function revisions(): Revision[] {
  const row = (
    id: string,
    deliverable_id: string,
    client_id: string,
    revision_number: number,
    status: Revision['status'],
    requested_by: string,
    submitted: number,
    type: Revision['revision_type'],
    description: string,
  ): Revision => ({
    id,
    deliverable_id,
    client_id,
    revision_number,
    on_version: revision_number,
    revision_type: type,
    description,
    attachment_names: [],
    priority: 'normal',
    status,
    counts_against_limit: true,
    requested_by,
    submitted_at: at(submitted),
    delivered_at: status === 'delivered' ? at(submitted + 2) : null,
  })

  return [
    row('r-agk-1', 'd-agk-1', agk, 1, 'delivered', agkAdmin, -5, 'video_cut', 'Use the new logo at the end and keep the offer text on screen for two more seconds.'),
    row('r-agk-2', 'd-agk-3', agk, 1, 'submitted', agkAdmin, -1, 'copy_text', 'Coach Vignesh has 8 years of experience, not 6. Please swap the second photo.'),
    row('r-raack-1', 'd-raack-2', raack, 1, 'delivered', raackAdmin, -9, 'video_cut', 'Add subtitles in Tamil and English.'),
    row('r-raack-2', 'd-raack-3', raack, 1, 'delivered', raackAdmin, -7, 'copy_text', 'Mention that the trial class is free for children under 12.'),
    row('r-raack-3', 'd-raack-3', raack, 2, 'in_progress', raackMember, -2, 'copy_text', 'Change the batch timing to 5:30 PM on weekdays.'),
  ]
}

function comments(): Comment[] {
  const row = (
    id: string,
    client_id: string,
    project_id: string,
    target_id: string,
    author_id: string,
    visibility: Comment['visibility'],
    created: number,
    body: string,
  ): Comment => ({
    id,
    client_id,
    project_id,
    target_type: 'deliverable',
    target_id,
    author_id,
    body,
    visibility,
    created_at: at(created),
  })

  return [
    row('cm-agk-1', agk, 'p-agk-social', 'd-agk-1', agkAdmin, 'client', -5, 'Looks good. The ending feels rushed, can we hold the offer a little longer?'),
    row('cm-agk-2', agk, 'p-agk-social', 'd-agk-1', pm, 'client', -3, 'Done in version 2. The offer now stays for four seconds.'),
    row('cm-agk-3', agk, 'p-agk-social', 'd-agk-1', pm, 'internal', -3, 'Editor spent 3 extra hours on v2. Flag if they ask for another music change.'),
    row('cm-raack-1', raack, 'p-raack-film', 'd-raack-4', pm, 'internal', -2, 'Called the academy twice about footage. Escalate to the founder on Friday if nothing arrives.'),
    row('cm-raack-2', raack, 'p-raack-admissions', 'd-raack-1', raackAdmin, 'client', -1, 'Can the batch start date be bigger?'),
  ]
}

function files(): FileRecord[] {
  const row = (id: string, client_id: string, name: string, mime_type: string, size_bytes: number, by: string): FileRecord => ({
    id,
    client_id,
    project_id: null,
    deliverable_id: null,
    folder: 'brand_assets',
    name,
    mime_type,
    size_bytes,
    storage_key: `clients/${client_id}/brand_assets/${name}`,
    url: panel(name, 1),
    external_url: null,
    version: 1,
    uploaded_by: by,
    visibility: 'client',
    created_at: at(-40),
  })

  const inFolder = (file: FileRecord, folder: FileRecord['folder'], created: number): FileRecord => ({
    ...file,
    folder,
    storage_key: `clients/${file.client_id}/${folder}/${file.name}`,
    created_at: at(created),
  })

  return [
    row('f-agk-1', agk, 'agk-logo.png', 'image/png', 184_320, agkAdmin),
    // A Google Drive file opens in Drive rather than downloading.
    {
      ...row('f-agk-2', agk, 'agk-brand-colours.pdf', 'application/pdf', 912_000, agkAdmin),
      url: null,
      external_url: 'https://drive.google.com/file/d/PLACEHOLDER_FILE_ID/view',
    },
    row('f-raack-1', raack, 'raack-logo.svg', 'image/svg+xml', 24_600, raackAdmin),
    // Vernex-delivered files for the other Vault tabs. Raack has none, so its tabs show empty states.
    inFolder(row('f-agk-3', agk, 'diwali-offer-1080x1080.png', 'image/png', 402_000, pm), 'rendered_ads', -9),
    inFolder(row('f-agk-4', agk, 'trial-week-story.png', 'image/png', 288_000, pm), 'rendered_ads', -4),
    {
      ...inFolder(row('f-agk-5', agk, 'social-media-scope-of-work.pdf', 'application/pdf', 1_240_000, pm), 'documents', -38),
      url: SAMPLE_PDF,
    },
    {
      ...inFolder(row('f-agk-6', agk, 'monthly-report-september.pdf', 'application/pdf', 860_000, pm), 'documents', -8),
      url: null,
      external_url: 'https://drive.google.com/file/d/PLACEHOLDER_REPORT_ID/view',
    },
    { ...inFolder(row('f-agk-7', agk, 'VX-26-27-0042.pdf', 'application/pdf', 96_000, pm), 'invoices', -20), url: SAMPLE_PDF },
  ]
}

function serviceRequests(): ServiceRequest[] {
  return [
    {
      id: 'sr-agk-1',
      client_id: agk,
      project_id: 'p-agk-web',
      title: 'Add online membership payments',
      description: 'Members should be able to pay the monthly fee on the website by UPI.',
      status: 'quoted',
      quote_amount_minor: rupees(18_000),
      desired_date: day(20),
      attachment_names: ['payment-flow-sketch.png'],
      requested_by: agkAdmin,
      created_at: at(-6),
    },
    {
      id: 'sr-raack-1',
      client_id: raack,
      project_id: null,
      title: 'Extra reel for the summer camp',
      description: null,
      status: 'submitted',
      quote_amount_minor: null,
      desired_date: null,
      attachment_names: [],
      requested_by: raackAdmin,
      created_at: at(-1),
    },
  ]
}

// Both clients are in Tamil Nadu, the same state as Vernex, so GST is CGST 9% + SGST 9%.
function invoicesAndItems(): { invoices: Invoice[]; items: InvoiceItem[] } {
  const invoices: Invoice[] = []
  const items: InvoiceItem[] = []

  const add = (
    id: string,
    client_id: string,
    number: string,
    status: Invoice['status'],
    amount: number,
    issued: number,
    due: number,
    description: string,
    project_id: string | null = null,
  ) => {
    const subtotal = rupees(amount)
    const tax = Math.round(subtotal * 0.09)
    const total = subtotal + tax * 2
    invoices.push({
      id,
      client_id,
      project_id,
      milestone_id: null,
      number,
      status,
      currency: 'INR',
      subtotal_minor: subtotal,
      cgst_minor: tax,
      sgst_minor: tax,
      igst_minor: 0,
      total_minor: total,
      amount_paid_minor: status === 'paid' ? total : 0,
      issue_date: day(issued),
      due_date: day(due),
      paid_at: status === 'paid' ? at(due - 2) : null,
      created_at: at(issued),
    })
    items.push({
      id: `${id}-item-1`,
      invoice_id: id,
      description,
      sac_code: '998361',
      quantity: 1,
      unit_price_minor: subtotal,
      amount_minor: subtotal,
    })
  }

  // AGK Fitness: INR 15,000 retainer + 18% GST = INR 17,700 a month.
  add('inv-agk-1', agk, 'VX/26-27/0031', 'paid', 15_000, -67, -60, 'Social media retainer, month 1 of 6', 'p-agk-social')
  add('inv-agk-2', agk, 'VX/26-27/0038', 'paid', 15_000, -37, -30, 'Social media retainer, month 2 of 6', 'p-agk-social')
  add('inv-agk-3', agk, 'VX/26-27/0046', 'sent', 15_000, -7, 7, 'Social media retainer, month 3 of 6', 'p-agk-social')
  add('inv-agk-4', agk, 'VX/26-27/0044', 'overdue', 20_000, -20, -5, 'Membership website, 50% advance', 'p-agk-web')

  // Raack Dance Academy
  add('inv-raack-1', raack, 'VX/26-27/0039', 'paid', 12_000, -35, -28, 'Admissions campaign retainer, month 1 of 3', 'p-raack-admissions')
  add('inv-raack-2', raack, 'VX/26-27/0047', 'sent', 12_000, -5, 10, 'Admissions campaign retainer, month 2 of 3', 'p-raack-admissions')
  // Draft: staff can see it, the client cannot until it is sent.
  add('inv-raack-3', raack, 'VX/26-27/0048', 'draft', 17_500, 0, 15, 'Annual day film, 50% advance', 'p-raack-film')

  return { invoices, items }
}

function actionItems(): ActionItem[] {
  const row = (
    base: Pick<ActionItem, 'id' | 'client_id' | 'type' | 'title'> & Partial<ActionItem>,
    created: number,
    due: number,
  ): ActionItem => ({
    project_id: null,
    ref_type: null,
    ref_id: null,
    assigned_user_id: null,
    blocks_milestone: false,
    due_at: at(due),
    resolved_at: null,
    created_at: at(created),
    ...base,
  })

  return [
    row({ id: 'a-agk-1', client_id: agk, type: 'approval', title: 'Approve the October reel (version 2)', project_id: 'p-agk-social', ref_type: 'deliverable', ref_id: 'd-agk-1', blocks_milestone: true }, -3, 2),
    row({ id: 'a-agk-2', client_id: agk, type: 'approval', title: 'Review the membership page design', project_id: 'p-agk-web', ref_type: 'deliverable', ref_id: 'd-agk-5', blocks_milestone: true }, -2, 4),
    row({ id: 'a-agk-3', client_id: agk, type: 'invoice_due', title: 'Invoice VX/26-27/0044 is 5 days overdue', project_id: 'p-agk-web', ref_type: 'invoice', ref_id: 'inv-agk-4' }, -5, -5),
    row({ id: 'a-agk-4', client_id: agk, type: 'missing_asset', title: 'Send photos of the gym floor for the website', project_id: 'p-agk-web' }, -8, 1),
    row({ id: 'a-agk-5', client_id: agk, type: 'approval', title: 'Approve the Navratri offer carousel', project_id: 'p-agk-social', ref_type: 'deliverable', ref_id: 'd-agk-2', resolved_at: at(-4) }, -6, -3),
    row({ id: 'a-raack-1', client_id: raack, type: 'approval', title: 'Approve the Bharatanatyam batch poster', project_id: 'p-raack-admissions', ref_type: 'deliverable', ref_id: 'd-raack-1', blocks_milestone: true }, -1, 1),
    row({ id: 'a-raack-2', client_id: raack, type: 'missing_asset', title: 'Upload the rehearsal footage for the teaser', project_id: 'p-raack-film', blocks_milestone: true }, -6, -3),
    row({ id: 'a-raack-3', client_id: raack, type: 'invoice_due', title: 'Invoice VX/26-27/0047 is due in 10 days', project_id: 'p-raack-admissions', ref_type: 'invoice', ref_id: 'inv-raack-2' }, -5, 10),
  ]
}

function feedback(): Feedback[] {
  return [
    {
      id: 'fb-agk-1',
      client_id: agk,
      kind: 'founder_box',
      founder_category: 'praise',
      rating: null,
      subject: 'The Navratri posts worked',
      message: 'We got 14 walk-ins from the carousel. Please thank the design team.',
      private_from_team: true,
      status: 'acknowledged',
      submitted_by: agkAdmin,
      created_at: at(-3),
      responded_at: at(-2),
      reply: 'Thank you, Arun. I have passed this on to the design team. Keep the walk-ins coming!',
    },
    {
      id: 'fb-raack-1',
      client_id: raack,
      kind: 'founder_box',
      founder_category: 'concern',
      rating: null,
      subject: 'Worried about the annual day timeline',
      message: 'The film has not started and the event is five weeks away. Can we talk?',
      private_from_team: true,
      status: 'new',
      submitted_by: raackAdmin,
      created_at: at(-1),
      responded_at: null,
      reply: null,
    },
  ]
}

// Every person and company below is invented.
function leads(): Lead[] {
  const lead = (base: Pick<Lead, 'id' | 'company' | 'stage'> & Partial<Lead>, created: number): Lead => ({
    country: 'India',
    city: 'Chennai',
    industry: null,
    website: null,
    instagram: null,
    linkedin: null,
    decision_maker: null,
    role: null,
    email: null,
    phone_e164: null,
    score: null,
    tier: null,
    problem: null,
    opportunity: null,
    recommended_offer: null,
    monthly_budget_minor: null,
    next_action: null,
    follow_up_date: null,
    notes: null,
    converted_client_id: null,
    created_at: at(created),
    ...base,
  })

  return [
    lead({ id: 'l-1', company: 'GT Auto Works', stage: 'new_lead', industry: 'Automotive', decision_maker: 'Ganesh T', role: 'Owner', phone_e164: '+919000000103', next_action: 'Research their Instagram', follow_up_date: day(1) }, -1),
    lead({ id: 'l-2', company: 'Bloom Dental Care', stage: 'researched', industry: 'Healthcare', city: 'Coimbatore', decision_maker: 'Farhana B', role: 'Founder', instagram: '@bloomdental', phone_e164: '+919000000102', score: 62, tier: 'B', problem: 'No bookings from social', next_action: 'Write the intro message', follow_up_date: day(0) }, -4),
    lead({ id: 'l-3', company: 'Sri Lakshmi Sweets', stage: 'qualified', industry: 'Food', decision_maker: 'Prakash M', role: 'Partner', phone_e164: '+919000000101', score: 78, tier: 'A', opportunity: 'Festival season campaign', monthly_budget_minor: rupees(25_000), next_action: 'Send the intro on WhatsApp', follow_up_date: day(-2), notes: 'Referred by AGK Fitness.' }, -9),
    lead({ id: 'l-4', company: 'Kavya Silks', stage: 'outreach_sent', industry: 'Retail', city: 'Madurai', score: 55, tier: 'B', next_action: 'Follow up if no reply', follow_up_date: day(2) }, -7),
    lead({ id: 'l-5', company: 'Pixel Pets Clinic', stage: 'responded', industry: 'Veterinary', score: 70, tier: 'B', next_action: 'Book a discovery call', follow_up_date: day(1) }, -12),
    lead({ id: 'l-6', company: 'Urban Brew Cafe', stage: 'discovery_call', industry: 'Food', score: 81, tier: 'A', recommended_offer: 'Social media retainer', monthly_budget_minor: rupees(18_000), next_action: 'Send the call summary', follow_up_date: day(3) }, -15),
    lead({ id: 'l-7', company: 'Nila Interiors', stage: 'proposal', industry: 'Interiors', score: 88, tier: 'A', recommended_offer: 'Website plus ads', monthly_budget_minor: rupees(40_000), next_action: 'Chase the proposal reply', follow_up_date: day(-1) }, -21),
    lead({ id: 'l-8', company: 'Orbit Tuition Centre', stage: 'closed_won', industry: 'Education', email: 'hello@orbittuition.example', score: 90, tier: 'A', recommended_offer: 'Admissions campaign', monthly_budget_minor: rupees(15_000), next_action: 'Convert to client', notes: 'Signed the 3 month retainer.' }, -30),
    lead({ id: 'l-9', company: 'Zed Gym Equipment', stage: 'closed_lost', industry: 'Retail', score: 40, tier: 'C', notes: 'Went with an in-house hire.' }, -40),
  ]
}

function leadActivity(): LeadActivity[] {
  return leads().map((row) => ({
    id: `la-${row.id}`,
    lead_id: row.id,
    kind: 'created' as const,
    text: 'Lead added',
    by: SEED_IDS.pm,
    created_at: row.created_at,
  }))
}

function reminders(): Reminder[] {
  const row = (id: string, recipient_name: string, phone_e164: string, reason: string, message: string, due: number, status: Reminder['status'] = 'queued'): Reminder => ({
    id,
    recipient_name,
    phone_e164,
    reason,
    message,
    due_at: at(due),
    status,
    sent_at: status === 'sent' ? at(due) : null,
    created_at: at(due - 2),
  })
  return [
    row('rm-1', 'Arun Kumar', '+919000000002', 'Invoice VX/26-27/0044 is overdue', 'Hi Arun, a gentle reminder that invoice VX/26-27/0044 (₹23,600) was due 5 days ago. Could you share when we can expect the payment? Thank you!', -1),
    row('rm-2', 'Arun Kumar', '+919000000002', 'Membership page design waiting for approval', 'Hi Arun, the membership page design has been waiting for your review for 2 days. It takes two minutes in the portal. Thank you!', 0),
    row('rm-3', 'Raack admin', '+919000000003', 'Rehearsal footage still missing', 'Hi, we are still waiting for the rehearsal footage for the annual day teaser. Could you upload it to the Vault this week?', 1),
    row('rm-4', 'Prakash M', '+919000000101', 'Follow up on the intro', 'Hi Prakash, following up on our intro about festival season posts. Shall we find 15 minutes this week?', 2),
    row('rm-5', 'Arun Kumar', '+919000000002', 'Invoice VX/26-27/0038 paid', 'Hi Arun, thank you for the payment of invoice VX/26-27/0038.', -9, 'sent'),
  ]
}

function aiDrafts(): AiDraft[] {
  const row = (id: string, kind: AiDraft['kind'], subject: string, title: string, body: string, status: AiDraft['status'], created: number): AiDraft => ({
    id,
    kind,
    title,
    subject,
    body,
    status,
    created_at: at(created),
    updated_at: at(created),
  })
  return [
    row('ai-1', 'weekly_summary', 'AGK Fitness', 'Weekly summary: AGK Fitness', 'This week we posted 4 reels and stories. Reach grew 12% and 9 new leads came in. The October reel is waiting for your approval, and the membership page design needs a review. Next week: November content calendar and the Diwali offer poster.', 'draft', -1),
    row('ai-2', 'weekly_summary', 'Raack Dance Academy', 'Weekly summary: Raack Dance Academy', 'This week the admissions poster went into review and 14 enquiries arrived from Instagram. We still need the rehearsal footage for the annual day teaser. Next week: summer camp early bird creative.', 'approved', -2),
    row('ai-3', 'outreach', 'Kavya Silks', 'Intro message: Kavya Silks', 'Hi, I am from Vernex Digital Marketing in Chennai. I noticed your festive collection posts get strong saves but few enquiries. We help retail brands turn that attention into WhatsApp orders. Could I share two quick ideas for Diwali?', 'draft', -1),
    row('ai-4', 'outreach', 'Pixel Pets Clinic', 'Follow-up: Pixel Pets Clinic', 'Thanks for replying! Here is what we discussed: a monthly plan with 8 posts, 2 reels and appointment ads. Would Thursday at 4 pm suit for a 20 minute call?', 'sent', -5),
  ]
}

// Small deterministic generator so the numbers are the same on every reload.
function series(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function socialMetrics(): SocialMetricDaily[] {
  const rows: SocialMetricDaily[] = []
  const accounts = [
    { client_id: agk, project_id: 'p-agk-social', followers: 4_180, reach: 1_900, seed: 11 },
    { client_id: raack, project_id: 'p-raack-admissions', followers: 2_640, reach: 1_250, seed: 29 },
  ]

  for (const account of accounts) {
    const random = series(account.seed)
    let followers = account.followers
    for (let offset = -29; offset <= 0; offset++) {
      followers += Math.round(random() * 14) - 2
      const reach = Math.round(account.reach * (0.7 + random() * 0.9))
      rows.push({
        client_id: account.client_id,
        project_id: account.project_id,
        platform: 'instagram',
        date: day(offset),
        followers,
        reach,
        impressions: Math.round(reach * (1.3 + random() * 0.5)),
        engagements: Math.round(reach * (0.04 + random() * 0.05)),
        profile_visits: Math.round(reach * (0.03 + random() * 0.03)),
        leads: Math.round(random() * 4),
        ad_spend_minor: rupees(Math.round(250 + random() * 350)),
      })
    }
  }
  return rows
}

const POST_TITLES: Record<string, string[]> = {
  [agk]: [
    'Monday motivation reel',
    'Trainer spotlight: Karthik',
    'Free trial week announcement',
    'Member transformation story',
    'Five-minute warm-up routine',
    'New batch timings carousel',
    'Protein myths busted',
    'Weekend challenge recap',
  ],
  [raack]: [
    'Annual day teaser reel',
    'Beginner batch admissions open',
    'Student performance highlight',
    'Behind the scenes: rehearsal',
    'Bharatanatyam basics carousel',
    'Summer camp early bird offer',
    'Teacher introduction: Meera',
    'Workshop photo recap',
  ],
}

function socialPosts(): SocialPost[] {
  const rows: SocialPost[] = []
  const accounts = [
    { client_id: agk, base: 2_400, seed: 41 },
    { client_id: raack, base: 1_600, seed: 67 },
  ]
  for (const account of accounts) {
    const random = series(account.seed)
    ;(POST_TITLES[account.client_id] ?? []).forEach((title, index) => {
      const reach = Math.round(account.base * (0.5 + random() * 1.5))
      rows.push({
        id: `sp-${account.client_id.slice(2)}-${index + 1}`,
        client_id: account.client_id,
        platform: index % 3 === 2 ? 'facebook' : 'instagram',
        title,
        published_at: at(-(index * 3 + 1)),
        reach,
        engagements: Math.round(reach * (0.04 + random() * 0.06)),
      })
    })
  }
  return rows
}

// Placeholder previews: flat SVG panels for images, public sample files for video and PDF, and an
// unpublished Drive id for the embed. Replace with real storage URLs when Supabase Storage lands.
const SAMPLE_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
const SAMPLE_DRIVE = 'https://drive.google.com/file/d/PLACEHOLDER_FILE_ID/preview'

// The three hex values inside the SVG below are the paper, ink and signal tokens from tokens.css.
// An SVG used as an image cannot read CSS variables, so the values are repeated here; the file is
// mock data and goes away when real storage URLs arrive.
function panel(title: string, version: number): string {
  const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">' +
    '<rect width="1080" height="1080" fill="#FAF7F2"/><rect x="60" y="60" width="960" height="960" fill="none" stroke="#1C1915" stroke-width="4"/>' +
    '<text x="540" y="520" font-family="serif" font-size="64" font-weight="600" text-anchor="middle" fill="#1C1915">' + safe + '</text>' +
    '<text x="540" y="620" font-family="monospace" font-size="40" text-anchor="middle" fill="#C2410C">v' + version + '</text></svg>'
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

function previewFor(row: Deliverable, version: number): Pick<DeliverableVersion, 'preview_kind' | 'preview_url'> {
  switch (row.kind) {
    case 'video':
      return { preview_kind: 'video', preview_url: SAMPLE_VIDEO }
    case 'document':
    case 'report':
      return { preview_kind: 'pdf', preview_url: SAMPLE_PDF }
    case 'web_page':
    case 'software_build':
      return { preview_kind: 'drive', preview_url: SAMPLE_DRIVE }
    default:
      return { preview_kind: 'image', preview_url: panel(row.title, version) }
  }
}

/** One version per number up to the current one, so every deliverable has something to preview. */
function deliverableVersions(rows: Deliverable[]): DeliverableVersion[] {
  return rows.flatMap((row) =>
    Array.from({ length: row.current_version }, (_, index): DeliverableVersion => {
      const version = index + 1
      return {
        id: row.id + '-v' + version,
        deliverable_id: row.id,
        client_id: row.client_id,
        version,
        ...previewFor(row, version),
        created_at: at(-20 + version * 4),
      }
    }),
  )
}

const IMAGE_KINDS: Deliverable['kind'][] = ['image', 'post', 'ad_creative', 'design']

function withThumbnails(rows: Deliverable[]): Deliverable[] {
  return rows.map((row) =>
    IMAGE_KINDS.includes(row.kind) ? { ...row, thumbnail_url: panel(row.title, row.current_version) } : row,
  )
}

export type MockDatabase = { [K in keyof Tables]: Tables[K][] }

export function createSeed(): MockDatabase {
  const { invoices, items } = invoicesAndItems()
  return {
    clients: clients(),
    profiles: profiles(),
    client_assignments: clientAssignments(),
    projects: projects(),
    milestones: milestones(),
    deliverables: withThumbnails(deliverables()),
    deliverable_versions: deliverableVersions(deliverables()),
    revisions: revisions(),
    revision_grants: [],
    comments: comments(),
    files: files(),
    service_requests: serviceRequests(),
    invoices,
    invoice_items: items,
    action_items: actionItems(),
    feedback: feedback(),
    social_metrics_daily: socialMetrics(),
    social_posts: socialPosts(),
    leads: leads(),
    lead_activity: leadActivity(),
    reminders: reminders(),
    ai_drafts: aiDrafts(),
  }
}
