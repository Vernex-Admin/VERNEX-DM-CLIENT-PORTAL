import type {
  ActionItem,
  Client,
  ClientAssignment,
  Comment,
  Deliverable,
  Feedback,
  FileRecord,
  Invoice,
  InvoiceItem,
  Lead,
  Milestone,
  Profile,
  Project,
  Revision,
  ServiceRequest,
  SocialMetricDaily,
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
    description: string,
  ): Revision => ({
    id,
    deliverable_id,
    client_id,
    revision_number,
    on_version: revision_number,
    description,
    priority: 'normal',
    status,
    counts_against_limit: true,
    requested_by,
    submitted_at: at(submitted),
    delivered_at: status === 'delivered' ? at(submitted + 2) : null,
  })

  return [
    row('r-agk-1', 'd-agk-1', agk, 1, 'delivered', agkAdmin, -5, 'Use the new logo at the end and keep the offer text on screen for two more seconds.'),
    row('r-agk-2', 'd-agk-3', agk, 1, 'submitted', agkAdmin, -1, 'Coach Vignesh has 8 years of experience, not 6. Please swap the second photo.'),
    row('r-raack-1', 'd-raack-2', raack, 1, 'delivered', raackAdmin, -9, 'Add subtitles in Tamil and English.'),
    row('r-raack-2', 'd-raack-3', raack, 1, 'delivered', raackAdmin, -7, 'Mention that the trial class is free for children under 12.'),
    row('r-raack-3', 'd-raack-3', raack, 2, 'in_progress', raackMember, -2, 'Change the batch timing to 5:30 PM on weekdays.'),
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
    version: 1,
    uploaded_by: by,
    visibility: 'client',
    created_at: at(-40),
  })

  return [
    row('f-agk-1', agk, 'agk-logo.png', 'image/png', 184_320, agkAdmin),
    row('f-agk-2', agk, 'agk-brand-colours.pdf', 'application/pdf', 912_000, agkAdmin),
    row('f-raack-1', raack, 'raack-logo.svg', 'image/svg+xml', 24_600, raackAdmin),
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
      status: 'acknowledged',
      submitted_by: agkAdmin,
      created_at: at(-3),
      responded_at: at(-2),
    },
    {
      id: 'fb-raack-1',
      client_id: raack,
      kind: 'founder_box',
      founder_category: 'concern',
      rating: null,
      subject: 'Worried about the annual day timeline',
      message: 'The film has not started and the event is five weeks away. Can we talk?',
      status: 'new',
      submitted_by: raackAdmin,
      created_at: at(-1),
      responded_at: null,
    },
  ]
}

function leads(): Lead[] {
  return [
    { id: 'l-1', name: 'Prakash M', business: 'Sri Lakshmi Sweets', phone_e164: '+919000000101', source: 'Referral: AGK Fitness', status: 'proposal_sent', created_at: at(-9) },
    { id: 'l-2', name: 'Farhana B', business: 'Bloom Dental Care', phone_e164: '+919000000102', source: 'Instagram', status: 'contacted', created_at: at(-4) },
    { id: 'l-3', name: 'Ganesh T', business: 'GT Auto Works', phone_e164: '+919000000103', source: 'Website enquiry', status: 'new', created_at: at(-1) },
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
      })
    }
  }
  return rows
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
    deliverables: deliverables(),
    revisions: revisions(),
    comments: comments(),
    files: files(),
    service_requests: serviceRequests(),
    invoices,
    invoice_items: items,
    action_items: actionItems(),
    feedback: feedback(),
    social_metrics_daily: socialMetrics(),
    leads: leads(),
  }
}
