import { invoiceTotals, itemAmount } from '../../lib/money'
import { can } from '../../lib/permissions'
import type {
  Client,
  ClientAssignment,
  ClientInsert,
  CommentTarget,
  Deliverable,
  InvoiceItem,
  Lead,
  LeadActivity,
  LeadStage,
  NotificationPrefs,
  Profile,
} from '../../types/db'
import { DataError } from '../types'
import type { ActivityEvent, AuthSession, DataLayer, LeadInsert } from '../types'
import {
  currentProfile,
  db,
  guard,
  me,
  newId,
  nowIso,
  readOne,
  removeWhere,
  run,
  setCurrentProfileId,
  visible,
  visibleClientIds,
  writable,
} from './store'

const isClientUser = (profile: Profile) => profile.role === 'client_admin' || profile.role === 'client_member'

function insertClient(input: ClientInsert, profile: Profile): Client {
  const client = {
    logo_url: null,
    industry: null,
    city: null,
    gstin: null,
    billing_email: null,
    currency: 'INR' as const,
    retainer_minor: null,
    retainer_months: null,
    ...input,
    id: newId(),
    created_at: nowIso(),
  }
  db.clients.push(client)
  // A PM only sees assigned clients, so the creator is assigned to what they create.
  if (profile.role === 'vernex_pm') {
    db.client_assignments.push({ client_id: client.id, user_id: profile.id, is_account_lead: true })
  }
  return client
}

const STAGE_LABEL: Record<LeadStage, string> = {
  new_lead: 'New Lead',
  researched: 'Researched',
  qualified: 'Qualified',
  outreach_sent: 'Outreach Sent',
  responded: 'Responded',
  discovery_call: 'Discovery Call',
  qualified_opportunity: 'Qualified Opportunity',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

function newLead(input: LeadInsert): Lead {
  if (!input.company?.trim()) throw new DataError('invalid', 'A lead needs a company name.')
  return {
    stage: 'new_lead',
    country: 'India',
    city: null,
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
    ...input,
    company: input.company.trim(),
    converted_client_id: null,
    id: newId(),
    created_at: nowIso(),
  }
}

function logLead(leadId: string, kind: LeadActivity['kind'], text: string) {
  db.lead_activity.push({ id: newId(), lead_id: leadId, kind, text, by: currentProfile()?.id ?? null, created_at: nowIso() })
}

function readDraft(id: string) {
  const draft = db.ai_drafts.find((row) => row.id === id)
  if (!draft) throw new DataError('not_found', `No draft ${id}`)
  return draft
}

function founderMessage(id: string) {
  const message = db.feedback.find((row) => row.id === id && row.kind === 'founder_box')
  if (!message) throw new DataError('not_found', `No message ${id}`)
  return message
}

/** A deliverable the signed-in user may see: clients never see Vernex's internal work. */
function readDeliverable(id: string): Deliverable {
  const deliverable = readOne(db.deliverables, id, 'deliverable')
  if (isClientUser(me()) && deliverable.visibility === 'internal') {
    throw new DataError('not_found', `No deliverable ${id}`)
  }
  return deliverable
}

/** Closes the open action items that point at a record, e.g. once a deliverable is approved. */
function resolveActionItemsFor(refId: string) {
  for (const item of db.action_items) {
    if (item.ref_id === refId && item.resolved_at === null) item.resolved_at = nowIso()
  }
}

/** The client that owns whatever a comment is attached to. */
function commentTargetOwner(type: CommentTarget, id: string): { client_id: string; project_id: string | null } {
  const tables: Record<CommentTarget, ReadonlyArray<{ id: string; client_id: string; project_id?: string | null }>> = {
    deliverable: db.deliverables,
    file: db.files,
    project: db.projects,
    service_request: db.service_requests,
  }
  const target = tables[type].find((row) => row.id === id)
  if (!target) throw new DataError('not_found', `No ${type} ${id}`)
  return { client_id: target.client_id, project_id: type === 'project' ? target.id : (target.project_id ?? null) }
}

function nextInvoiceNumber(): string {
  const highest = Math.max(0, ...db.invoices.map((invoice) => Number(invoice.number.split('/').pop())))
  return `VX/26-27/${String(highest + 1).padStart(4, '0')}`
}

const SESSION_HOURS = 8
const DEFAULT_PREFS: NotificationPrefs = {
  email: true,
  whatsapp: true,
  approvals: true,
  comments: true,
  invoices: true,
  weekly_report: false,
}
// The mock's metrics sync ran 14 minutes before the app loaded.
const SYNCED_AT = Date.now() - 14 * 60_000
const pendingLinks = new Set<string>()

function toSession(profile: Profile): AuthSession {
  return {
    user: { id: profile.id, email: profile.email, user_metadata: { full_name: profile.full_name } },
    expires_at: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(),
  }
}

const normaliseEmail = (email: string) => email.trim().toLowerCase()
const profileByEmail = (email: string) =>
  db.profiles.find((profile) => profile.is_active && normaliseEmail(profile.email) === normaliseEmail(email))

function signInByEmail(email: string): AuthSession {
  const profile = profileByEmail(email)
  if (!profile) throw new DataError('not_found', 'No Vernex Hub account uses that email. Ask your Vernex contact for an invite.')
  setCurrentProfileId(profile.id)
  return toSession(profile)
}

/** Who did it, as the client reads it: client people by name, Vernex staff as Vernex. */
function actorName(id: string | null): string {
  const person = db.profiles.find((row) => row.id === id)
  if (!person) return 'Vernex'
  return person.client_id === null ? `${person.full_name.split(' ')[0]} from Vernex` : person.full_name
}

/** Everything the feed can show, built from the tables. Internal comments are never included. */
function activityEvents(): ActivityEvent[] {
  const title = (id: string) => db.deliverables.find((row) => row.id === id)?.title ?? 'a deliverable'
  const events: ActivityEvent[] = []

  for (const row of db.deliverables) {
    if (row.approved_at) {
      events.push({
        id: `approved-${row.id}`,
        client_id: row.client_id,
        kind: 'approval',
        text: `${actorName(row.approved_by)} approved ${row.title}`,
        at: row.approved_at,
        deliverable_id: row.id,
      })
    }
  }
  for (const row of db.revisions) {
    events.push({
      id: `revision-${row.id}`,
      client_id: row.client_id,
      kind: 'revision',
      text: `${actorName(row.requested_by)} asked for changes to ${title(row.deliverable_id)}`,
      at: row.submitted_at,
      deliverable_id: row.deliverable_id,
    })
    if (row.delivered_at) {
      events.push({
        id: `delivered-${row.id}`,
        client_id: row.client_id,
        kind: 'delivery',
        text: `Vernex delivered the changes to ${title(row.deliverable_id)}`,
        at: row.delivered_at,
        deliverable_id: row.deliverable_id,
      })
    }
  }
  for (const row of db.comments) {
    if (row.visibility !== 'client') continue
    events.push({
      id: `comment-${row.id}`,
      client_id: row.client_id,
      kind: 'comment',
      text:
        row.target_type === 'deliverable'
          ? `${actorName(row.author_id)} commented on ${title(row.target_id)}`
          : `${actorName(row.author_id)} left a comment`,
      at: row.created_at,
      deliverable_id: row.target_type === 'deliverable' ? row.target_id : null,
    })
  }
  for (const row of db.files) {
    if (row.visibility !== 'client') continue
    events.push({
      id: `file-${row.id}`,
      client_id: row.client_id,
      kind: 'file',
      text: `${actorName(row.uploaded_by)} uploaded ${row.name}`,
      at: row.created_at,
      deliverable_id: null,
    })
  }
  for (const row of db.invoices) {
    if (row.status === 'draft') continue
    events.push({
      id: `invoice-${row.id}`,
      client_id: row.client_id,
      kind: 'invoice',
      text: row.paid_at ? `Payment received for invoice ${row.number}` : `Invoice ${row.number} sent`,
      at: row.paid_at ?? row.created_at,
      deliverable_id: null,
    })
  }
  return events
}

export const mockData: DataLayer = {
  auth: {
    getSession: () =>
      run(() => {
        const profile = currentProfile()
        return profile ? toSession(profile) : null
      }),
    signInWithOtp: ({ email }) =>
      run(() => {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new DataError('invalid', 'Enter a valid email address.')
        if (profileByEmail(email)) pendingLinks.add(normaliseEmail(email))
      }),
    verifyOtp: ({ email }) =>
      run(() => {
        if (!pendingLinks.delete(normaliseEmail(email))) {
          throw new DataError('not_found', 'That sign-in link has expired or was never sent.')
        }
        return signInByEmail(email)
      }),
    signInWithOAuth: ({ email }) =>
      run(() => {
        if (!email?.trim()) throw new DataError('invalid', 'Type your email first: the mock Google sign-in uses it.')
        return signInByEmail(email)
      }),
    signOut: () =>
      run(() => {
        setCurrentProfileId(null)
      }),
  },

  session: {
    getCurrentProfile: () => run(() => currentProfile()),
    listSwitchableProfiles: () =>
      run(() => {
        if (import.meta.env.PROD) throw new DataError('forbidden', 'The profile switcher is development only.')
        return db.profiles
      }),
    switchProfile: (profileId) =>
      run(() => {
        if (import.meta.env.PROD) throw new DataError('forbidden', 'The profile switcher is development only.')
        if (profileId !== null && !db.profiles.some((profile) => profile.id === profileId)) {
          throw new DataError('not_found', `No profile ${profileId}`)
        }
        setCurrentProfileId(profileId)
        return currentProfile()
      }),
  },

  clients: {
    list: () =>
      run(() => {
        const ids = visibleClientIds(guard('client', 'view'))
        return db.clients.filter((client) => ids.has(client.id))
      }),
    get: (id) =>
      run(() => {
        const ids = visibleClientIds(guard('client', 'view'))
        const client = db.clients.find((row) => row.id === id)
        if (!client || !ids.has(id)) throw new DataError('not_found', `No client ${id}`)
        return client
      }),
    create: (input) =>
      run(() => insertClient(input, guard('client', 'create'))),
    update: (id, patch) =>
      run(() => {
        guard('client', 'edit', id)
        const client = db.clients.find((row) => row.id === id)
        if (!client) throw new DataError('not_found', `No client ${id}`)
        return Object.assign(client, patch)
      }),
    remove: (id) =>
      run(() => {
        guard('client', 'delete', id)
        const invoiceIds = new Set(db.invoices.filter((row) => row.client_id === id).map((row) => row.id))
        removeWhere(db.invoice_items, (row) => invoiceIds.has(row.invoice_id))
        removeWhere(db.clients, (row) => row.id === id)
        removeWhere(db.profiles, (row) => row.client_id === id)
        const tenantTables = [
          db.client_assignments,
          db.projects,
          db.milestones,
          db.deliverables,
          db.deliverable_versions,
          db.revisions,
          db.revision_grants,
          db.comments,
          db.files,
          db.service_requests,
          db.invoices,
          db.action_items,
          db.feedback,
          db.social_metrics_daily,
          db.social_posts,
        ]
        for (const table of tenantTables) removeWhere<{ client_id: string }>(table, (row) => row.client_id === id)
      }),
  },

  profiles: {
    listByClient: (clientId) =>
      run(() => {
        guard('client_user', 'view', clientId)
        return db.profiles.filter((profile) => profile.client_id === clientId)
      }),
    getAccountLead: (clientId) =>
      run(() => {
        guard('client', 'view', clientId)
        const lead = db.client_assignments.find((row) => row.client_id === clientId && row.is_account_lead)
        return db.profiles.find((profile) => profile.id === lead?.user_id) ?? null
      }),
    listStaff: () =>
      run(() => {
        guard('client', 'edit')
        return db.profiles.filter((profile) => profile.client_id === null && profile.is_active)
      }),
    listAccountLeads: () =>
      run(() => {
        const ids = visibleClientIds(guard('client', 'view'))
        return db.client_assignments.filter((row) => row.is_account_lead && ids.has(row.client_id))
      }),
    setAccountLead: (clientId, userId) =>
      run(() => {
        guard('client', 'edit', clientId)
        const person = db.profiles.find((profile) => profile.id === userId)
        if (!person || person.client_id !== null) throw new DataError('invalid', 'Choose a Vernex team member.')
        for (const row of db.client_assignments) {
          if (row.client_id === clientId) row.is_account_lead = false
        }
        let assignment: ClientAssignment | undefined = db.client_assignments.find(
          (row) => row.client_id === clientId && row.user_id === userId,
        )
        if (assignment) assignment.is_account_lead = true
        else {
          assignment = { client_id: clientId, user_id: userId, is_account_lead: true }
          db.client_assignments.push(assignment)
        }
        return assignment
      }),
    createClientUser: (input) =>
      run(() => {
        guard('client_user', 'create', input.client_id)
        if (input.role !== 'client_admin' && input.role !== 'client_member') {
          throw new DataError('invalid', 'A client user must be a client admin or a client member.')
        }
        if (profileByEmail(input.email) || db.profiles.some((row) => normaliseEmail(row.email) === normaliseEmail(input.email))) {
          throw new DataError('invalid', 'Someone already uses that email address.')
        }
        const profile = {
          phone_e164: null,
          avatar_url: null,
          can_approve: input.role === 'client_admin',
          is_active: true,
          notification_prefs: { ...DEFAULT_PREFS },
          ...input,
          id: newId(),
          created_at: nowIso(),
        }
        db.profiles.push(profile)
        return profile
      }),
    updateMe: (patch) =>
      run(() => {
        const profile = me()
        if (patch.full_name !== undefined) {
          if (!patch.full_name.trim()) throw new DataError('invalid', 'Your name cannot be empty.')
          profile.full_name = patch.full_name.trim()
        }
        if (patch.phone_e164 !== undefined) profile.phone_e164 = patch.phone_e164
        if (patch.notification_prefs) profile.notification_prefs = { ...patch.notification_prefs }
        return profile
      }),
    update: (id, patch) =>
      run(() => {
        const profile = db.profiles.find((row) => row.id === id)
        guard('client_user', 'edit', profile?.client_id ?? undefined)
        if (!profile || profile.client_id === null) throw new DataError('not_found', `No client user ${id}`)
        if (patch.role && patch.role !== 'client_admin' && patch.role !== 'client_member') {
          throw new DataError('invalid', 'A client user must be a client admin or a client member.')
        }
        return Object.assign(profile, patch)
      }),
    remove: (id) =>
      run(() => {
        const profile = db.profiles.find((row) => row.id === id)
        guard('client_user', 'delete', profile?.client_id ?? undefined)
        if (!profile || profile.client_id === null) throw new DataError('not_found', `No client user ${id}`)
        removeWhere(db.profiles, (row) => row.id === id)
      }),
  },

  projects: {
    list: (filter = {}) =>
      run(() => {
        const profile = guard('project', 'view', filter.client_id)
        return visible(db.projects, profile).filter((row) => !filter.client_id || row.client_id === filter.client_id)
      }),
    get: (id) => run(() => readOne(db.projects, id, 'project')),
    create: (input) =>
      run(() => {
        guard('project', 'create', input.client_id)
        const project = {
          description: null,
          health: 'on_track' as const,
          health_reason: null,
          start_date: null,
          target_end_date: null,
          default_revision_limit: 3,
          ...input,
          id: newId(),
          created_at: nowIso(),
        }
        db.projects.push(project)
        return project
      }),
    update: (id, patch) => run(() => Object.assign(writable(db.projects, id, 'project', 'edit'), patch)),
    remove: (id) =>
      run(() => {
        writable(db.projects, id, 'project', 'delete')
        const deliverableIds = new Set(db.deliverables.filter((row) => row.project_id === id).map((row) => row.id))
        removeWhere(db.revisions, (row) => deliverableIds.has(row.deliverable_id))
        removeWhere(db.deliverables, (row) => row.project_id === id)
        removeWhere(db.milestones, (row) => row.project_id === id)
        removeWhere(db.action_items, (row) => row.project_id === id)
        removeWhere(db.projects, (row) => row.id === id)
      }),
  },

  milestones: {
    list: (filter) =>
      run(() => {
        const project = readOne(db.projects, filter.project_id, 'milestone')
        return db.milestones.filter((row) => row.project_id === project.id).sort((a, b) => a.position - b.position)
      }),
    create: (input) =>
      run(() => {
        const project = db.projects.find((row) => row.id === input.project_id)
        guard('milestone', 'create', project?.client_id)
        if (!project) throw new DataError('not_found', `No project ${input.project_id}`)
        const siblings = db.milestones.filter((row) => row.project_id === project.id)
        const milestone = {
          position: siblings.length + 1,
          due_date: null,
          status: 'upcoming' as const,
          completed_at: null,
          invoice_trigger: false,
          ...input,
          client_id: project.client_id,
          id: newId(),
        }
        db.milestones.push(milestone)
        return milestone
      }),
    update: (id, patch) => run(() => Object.assign(writable(db.milestones, id, 'milestone', 'edit'), patch)),
    remove: (id) =>
      run(() => {
        const milestone = writable(db.milestones, id, 'milestone', 'delete')
        for (const deliverable of db.deliverables) {
          if (deliverable.milestone_id === id) deliverable.milestone_id = null
        }
        removeWhere(db.milestones, (row) => row.id === id)
        const rest = db.milestones.filter((row) => row.project_id === milestone.project_id).sort((a, b) => a.position - b.position)
        rest.forEach((row, index) => (row.position = index + 1))
      }),
    reorder: (projectId, orderedIds) =>
      run(() => {
        const project = db.projects.find((row) => row.id === projectId)
        guard('milestone', 'edit', project?.client_id)
        if (!project) throw new DataError('not_found', `No project ${projectId}`)
        const rows = db.milestones.filter((row) => row.project_id === projectId)
        const sameSet = rows.length === orderedIds.length && rows.every((row) => orderedIds.includes(row.id))
        if (!sameSet) throw new DataError('invalid', 'The new order must list every milestone of the project once.')
        orderedIds.forEach((id, index) => {
          const row = rows.find((candidate) => candidate.id === id) as (typeof rows)[number]
          row.position = index + 1
        })
        return rows.sort((a, b) => a.position - b.position)
      }),
  },

  deliverables: {
    list: (filter = {}) =>
      run(() => {
        const profile = guard('deliverable', 'view', filter.client_id)
        return visible(db.deliverables, profile).filter(
          (row) =>
            !(isClientUser(profile) && row.visibility === 'internal') &&
            (!filter.client_id || row.client_id === filter.client_id) &&
            (!filter.project_id || row.project_id === filter.project_id) &&
            (!filter.status || row.status === filter.status),
        )
      }),
    get: (id) => run(() => readDeliverable(id)),
    listVersions: (id) =>
      run(() => {
        const deliverable = readDeliverable(id)
        return db.deliverable_versions
          .filter((row) => row.deliverable_id === deliverable.id)
          .sort((a, b) => a.version - b.version)
      }),
    create: (input) =>
      run(() => {
        const project = db.projects.find((row) => row.id === input.project_id)
        guard('deliverable', 'create', project?.client_id)
        if (!project) throw new DataError('not_found', `No project ${input.project_id}`)
        const deliverable = {
          milestone_id: null,
          status: 'draft' as const,
          revision_limit: project.default_revision_limit,
          due_date: null,
          platform: null,
          caption: null,
          is_final: false,
          bulk_approvable: false,
          thumbnail_url: null,
          // Nothing reaches a client until staff publish it.
          visibility: 'internal' as const,
          ...input,
          id: newId(),
          client_id: project.client_id,
          current_version: 1,
          revisions_used: 0,
          approved_by: null,
          approved_at: null,
          approved_via: null,
          created_at: nowIso(),
        }
        db.deliverables.push(deliverable)
        return deliverable
      }),
    update: (id, patch) => run(() => Object.assign(writable(db.deliverables, id, 'deliverable', 'edit'), patch)),
    remove: (id) =>
      run(() => {
        writable(db.deliverables, id, 'deliverable', 'delete')
        removeWhere(db.revisions, (row) => row.deliverable_id === id)
        removeWhere(db.action_items, (row) => row.ref_id === id)
        removeWhere(db.deliverables, (row) => row.id === id)
      }),
    publishVersion: (id, input) =>
      run(() => {
        const deliverable = writable(db.deliverables, id, 'deliverable', 'edit')
        if (!input.preview_url.trim()) throw new DataError('invalid', 'Add a file or a Google Drive link.')
        const latest = Math.max(0, ...db.deliverable_versions.filter((row) => row.deliverable_id === id).map((row) => row.version))
        const version = latest + 1
        db.deliverable_versions.push({
          id: newId(),
          deliverable_id: id,
          client_id: deliverable.client_id,
          version,
          preview_kind: input.preview_kind,
          preview_url: input.preview_url.trim(),
          created_at: nowIso(),
        })
        deliverable.current_version = version
        if (input.visibility) deliverable.visibility = input.visibility
        if (deliverable.visibility === 'client') {
          // The client is asked to review, and any revision they were waiting on is now delivered.
          for (const revision of db.revisions) {
            if (revision.deliverable_id === id && revision.status !== 'delivered' && revision.status !== 'rejected_out_of_scope') {
              revision.status = 'delivered'
              revision.delivered_at = nowIso()
            }
          }
          deliverable.status = 'in_review'
          resolveActionItemsFor(id)
          db.action_items.push({
            id: newId(),
            client_id: deliverable.client_id,
            project_id: deliverable.project_id,
            type: 'approval',
            title: `Review ${deliverable.title} (version ${version})`,
            ref_type: 'deliverable',
            ref_id: id,
            assigned_user_id: null,
            blocks_milestone: false,
            due_at: deliverable.due_date ? `${deliverable.due_date}T12:00:00.000Z` : null,
            resolved_at: null,
            created_at: nowIso(),
          })
        } else if (deliverable.status === 'draft') {
          deliverable.status = 'in_progress'
        }
        return deliverable
      }),
    approve: (id) =>
      run(() => {
        const deliverable = writable(db.deliverables, id, 'deliverable', 'approve')
        readDeliverable(id)
        if (deliverable.status !== 'in_review') {
          throw new DataError('invalid', 'Only a deliverable that is in review can be approved.')
        }
        deliverable.status = 'approved'
        deliverable.approved_by = me().id
        deliverable.approved_at = nowIso()
        deliverable.approved_via = 'portal'
        resolveActionItemsFor(id)
        return deliverable
      }),
  },

  revisions: {
    list: (filter) =>
      run(() => {
        const deliverable = readDeliverable(filter.deliverable_id)
        return db.revisions
          .filter((row) => row.deliverable_id === deliverable.id)
          .sort((a, b) => a.revision_number - b.revision_number)
      }),
    grantBonus: ({ deliverable_id, reason }) =>
      run(() => {
        const deliverable = writable(db.deliverables, deliverable_id, 'revision', 'edit')
        if (reason.trim().length < 5) throw new DataError('invalid', 'Give a reason for the bonus revision.')
        deliverable.revision_limit += 1
        db.revision_grants.push({
          id: newId(),
          deliverable_id,
          client_id: deliverable.client_id,
          reason: reason.trim(),
          granted_by: me().id,
          created_at: nowIso(),
        })
        return deliverable
      }),
    request: (input) =>
      run(() => {
        const deliverable = writable(db.deliverables, input.deliverable_id, 'deliverable', 'request_revision')
        readDeliverable(input.deliverable_id)
        if (deliverable.status !== 'in_review') {
          throw new DataError('invalid', 'Changes can only be requested on a deliverable that is in review.')
        }
        if (deliverable.revisions_used >= deliverable.revision_limit) {
          throw new DataError(
            'invalid',
            'No revisions are left on this deliverable. Submit a service request for further changes.',
          )
        }
        const revision = {
          id: newId(),
          deliverable_id: deliverable.id,
          client_id: deliverable.client_id,
          revision_number: db.revisions.filter((row) => row.deliverable_id === deliverable.id).length + 1,
          on_version: deliverable.current_version,
          revision_type: input.revision_type ?? ('other' as const),
          description: input.description,
          attachment_names: input.attachment_names ?? [],
          priority: input.priority ?? ('normal' as const),
          status: 'submitted' as const,
          counts_against_limit: true,
          requested_by: me().id,
          submitted_at: nowIso(),
          delivered_at: null,
        }
        db.revisions.push(revision)
        deliverable.revisions_used += 1
        deliverable.status = 'revision_requested'
        resolveActionItemsFor(deliverable.id)
        return revision
      }),
    update: (id, patch) => run(() => Object.assign(writable(db.revisions, id, 'revision', 'edit'), patch)),
  },

  serviceRequests: {
    list: (filter = {}) =>
      run(() => {
        const profile = guard('service_request', 'view', filter.client_id)
        return visible(db.service_requests, profile).filter(
          (row) => !filter.client_id || row.client_id === filter.client_id,
        )
      }),
    submit: (input) =>
      run(() => {
        const profile = guard('service_request', 'create', input.client_id)
        const request = {
          id: newId(),
          client_id: input.client_id,
          project_id: input.project_id ?? null,
          title: input.title,
          description: input.description ?? null,
          status: 'submitted' as const,
          quote_amount_minor: null,
          desired_date: input.desired_date ?? null,
          attachment_names: input.attachment_names ?? [],
          requested_by: profile.id,
          created_at: nowIso(),
        }
        db.service_requests.push(request)
        return request
      }),
    update: (id, patch) =>
      run(() => Object.assign(writable(db.service_requests, id, 'service_request', 'edit'), patch)),
  },

  invoices: {
    list: (filter = {}) =>
      run(() => {
        const profile = guard('invoice', 'view', filter.client_id)
        return visible(db.invoices, profile).filter(
          (row) =>
            (!filter.client_id || row.client_id === filter.client_id) &&
            // A client sees an invoice once it has been sent.
            !(isClientUser(profile) && row.status === 'draft'),
        )
      }),
    get: (id) =>
      run(() => {
        const invoice = readOne(db.invoices, id, 'invoice')
        if (isClientUser(me()) && invoice.status === 'draft') throw new DataError('not_found', `No invoice ${id}`)
        return { ...invoice, items: db.invoice_items.filter((item) => item.invoice_id === id) }
      }),
    create: (input) =>
      run(() => {
        guard('invoice', 'create', input.client_id)
        if (input.items.length === 0) throw new DataError('invalid', 'An invoice needs at least one line item.')
        const { items: itemInputs, ...rest } = input
        const invoice = {
          project_id: null,
          milestone_id: null,
          status: 'draft' as const,
          ...rest,
          ...invoiceTotals(itemInputs),
          id: newId(),
          number: nextInvoiceNumber(),
          currency: 'INR' as const,
          amount_paid_minor: 0,
          paid_at: null,
          created_at: nowIso(),
        }
        const items: InvoiceItem[] = itemInputs.map((item) => ({
          id: newId(),
          invoice_id: invoice.id,
          description: item.description,
          sac_code: item.sac_code ?? null,
          quantity: item.quantity ?? 1,
          unit_price_minor: item.unit_price_minor,
          amount_minor: itemAmount(item),
        }))
        db.invoices.push(invoice)
        db.invoice_items.push(...items)
        return { ...invoice, items }
      }),
    update: (id, { items, ...patch }) =>
      run(() => {
        const invoice = writable(db.invoices, id, 'invoice', 'edit')
        if (items) {
          if (items.length === 0) throw new DataError('invalid', 'An invoice needs at least one line item.')
          removeWhere(db.invoice_items, (row) => row.invoice_id === id)
          db.invoice_items.push(
            ...items.map((item) => ({
              id: newId(),
              invoice_id: id,
              description: item.description,
              sac_code: item.sac_code ?? null,
              quantity: item.quantity ?? 1,
              unit_price_minor: item.unit_price_minor,
              amount_minor: itemAmount(item),
            })),
          )
          Object.assign(invoice, invoiceTotals(items))
        }
        return Object.assign(invoice, patch)
      }),
    remove: (id) =>
      run(() => {
        writable(db.invoices, id, 'invoice', 'delete')
        removeWhere(db.invoice_items, (row) => row.invoice_id === id)
        removeWhere(db.action_items, (row) => row.ref_id === id)
        removeWhere(db.invoices, (row) => row.id === id)
      }),
  },

  actionItems: {
    list: (filter = {}) =>
      run(() => {
        const profile = guard('action_item', 'view', filter.client_id)
        return visible(db.action_items, profile).filter(
          (row) =>
            (!filter.client_id || row.client_id === filter.client_id) &&
            (filter.open === undefined || (row.resolved_at === null) === filter.open),
        )
      }),
    create: (input) =>
      run(() => {
        guard('action_item', 'create', input.client_id)
        const item = {
          project_id: null,
          ref_type: null,
          ref_id: null,
          assigned_user_id: null,
          blocks_milestone: false,
          due_at: null,
          resolved_at: null,
          ...input,
          id: newId(),
          created_at: nowIso(),
        }
        db.action_items.push(item)
        return item
      }),
    resolve: (id) =>
      run(() => {
        const item = writable(db.action_items, id, 'action_item', 'edit')
        item.resolved_at ??= nowIso()
        return item
      }),
    remove: (id) =>
      run(() => {
        writable(db.action_items, id, 'action_item', 'delete')
        removeWhere(db.action_items, (row) => row.id === id)
      }),
  },

  comments: {
    list: (filter) =>
      run(() => {
        const owner = commentTargetOwner(filter.target_type, filter.target_id)
        const profile = guard('comment', 'view', owner.client_id)
        const seesInternal = can(profile, 'internal_comment', 'view')
        return db.comments
          .filter(
            (row) =>
              row.target_type === filter.target_type &&
              row.target_id === filter.target_id &&
              (seesInternal || row.visibility === 'client'),
          )
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
      }),
    create: (input) =>
      run(() => {
        const owner = commentTargetOwner(input.target_type, input.target_id)
        const visibility = input.visibility ?? 'client'
        const profile = guard(visibility === 'internal' ? 'internal_comment' : 'comment', 'create', owner.client_id)
        const comment = {
          id: newId(),
          client_id: owner.client_id,
          project_id: owner.project_id,
          target_type: input.target_type,
          target_id: input.target_id,
          author_id: profile.id,
          body: input.body,
          visibility,
          created_at: nowIso(),
        }
        db.comments.push(comment)
        return comment
      }),
  },

  files: {
    list: (filter) =>
      run(() => {
        const profile = guard('brand_asset', 'view', filter.client_id)
        return db.files.filter(
          (row) =>
            row.client_id === filter.client_id &&
            (!filter.folder || row.folder === filter.folder) &&
            (!isClientUser(profile) || row.visibility === 'client'),
        )
      }),
    uploadBrandAsset: (input) =>
      run(() => {
        const profile = guard('brand_asset', 'upload', input.client_id)
        const file = {
          id: newId(),
          client_id: input.client_id,
          project_id: null,
          deliverable_id: null,
          folder: 'brand_assets' as const,
          name: input.name,
          mime_type: input.mime_type ?? null,
          size_bytes: input.size_bytes ?? null,
          storage_key: `clients/${input.client_id}/brand_assets/${input.name}`,
          url: input.url ?? null,
          external_url: null,
          version: 1,
          uploaded_by: profile.id,
          visibility: 'client' as const,
          created_at: nowIso(),
        }
        db.files.push(file)
        return file
      }),
    remove: (id) =>
      run(() => {
        writable(db.files, id, 'brand_asset', 'delete')
        removeWhere(db.files, (row) => row.id === id)
      }),
  },

  founderBox: {
    send: (input) =>
      run(() => {
        const profile = guard('founder_box', 'create')
        if (!profile.client_id) throw new DataError('forbidden', 'Only client users can write to the founder.')
        const message = {
          id: newId(),
          client_id: profile.client_id,
          kind: 'founder_box' as const,
          founder_category: input.category,
          rating: null,
          subject: input.subject,
          message: input.message,
          private_from_team: input.private_from_team ?? true,
          status: 'new' as const,
          submitted_by: profile.id,
          created_at: nowIso(),
          responded_at: null,
          reply: null,
        }
        db.feedback.push(message)
        return message
      }),
    listMine: () =>
      run(() => {
        const profile = guard('founder_box', 'create')
        return db.feedback.filter((row) => row.kind === 'founder_box' && row.submitted_by === profile.id)
      }),
    listInbox: () =>
      run(() => {
        guard('founder_inbox', 'view')
        return db.feedback
          .filter((row) => row.kind === 'founder_box')
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
      }),
    reply: (id, text) =>
      run(() => {
        guard('founder_inbox', 'edit')
        if (!text.trim()) throw new DataError('invalid', 'Write a reply first.')
        const message = founderMessage(id)
        message.reply = text.trim()
        message.responded_at = nowIso()
        if (message.status === 'new') message.status = 'acknowledged'
        return message
      }),
    setStatus: (id, status) =>
      run(() => {
        guard('founder_inbox', 'edit')
        const message = founderMessage(id)
        message.status = status
        return message
      }),
  },

  socialMetrics: {
    listDaily: (filter) =>
      run(() => {
        guard('social_metrics', 'view', filter.client_id)
        const since = new Date(Date.now() - ((filter.days ?? 30) - 1) * 86_400_000).toISOString().slice(0, 10)
        return db.social_metrics_daily
          .filter((row) => row.client_id === filter.client_id && row.date >= since)
          .sort((a, b) => a.date.localeCompare(b.date))
      }),
    topPosts: (filter) =>
      run(() => {
        guard('social_metrics', 'view', filter.client_id)
        const since = new Date(Date.now() - ((filter.days ?? 30) - 1) * 86_400_000).toISOString()
        return db.social_posts
          .filter((row) => row.client_id === filter.client_id && row.published_at >= since)
          .sort((a, b) => b.reach - a.reach)
          .slice(0, filter.limit ?? 5)
      }),
    lastSyncedAt: (filter) =>
      run(() => {
        guard('social_metrics', 'view', filter.client_id)
        return new Date(SYNCED_AT).toISOString()
      }),
  },

  activity: {
    recent: (filter = {}) =>
      run(() => {
        const profile = guard('client', 'view', filter.client_id)
        const ids = visibleClientIds(profile)
        const hidden = new Set(
          isClientUser(profile) ? db.deliverables.filter((row) => row.visibility === 'internal').map((row) => row.id) : [],
        )
        const events = activityEvents().filter(
          (event) =>
            ids.has(event.client_id) &&
            (!filter.client_id || event.client_id === filter.client_id) &&
            !(event.deliverable_id && hidden.has(event.deliverable_id)),
        )
        return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, filter.limit ?? 10)
      }),
  },

  leads: {
    list: () =>
      run(() => {
        guard('lead', 'view')
        return db.leads
      }),
    create: (input) =>
      run(() => {
        guard('lead', 'create')
        const lead = newLead(input)
        db.leads.push(lead)
        logLead(lead.id, 'created', 'Lead added')
        return lead
      }),
    update: (id, patch) =>
      run(() => {
        guard('lead', 'edit')
        const lead = db.leads.find((row) => row.id === id)
        if (!lead) throw new DataError('not_found', `No lead ${id}`)
        if (patch.company !== undefined && !patch.company.trim()) throw new DataError('invalid', 'A lead needs a company name.')
        if (patch.score != null && (patch.score < 0 || patch.score > 100)) throw new DataError('invalid', 'Score is between 0 and 100.')
        const before = lead.stage
        const changed = Object.entries(patch).filter(([key, value]) => key !== 'stage' && lead[key as keyof Lead] !== value)
        Object.assign(lead, patch)
        if (patch.stage && patch.stage !== before) {
          logLead(id, 'stage', `Moved from ${STAGE_LABEL[before]} to ${STAGE_LABEL[patch.stage]}`)
        }
        if (changed.length > 0) logLead(id, 'edit', `Edited ${changed.map(([key]) => key.replaceAll('_', ' ')).join(', ')}`)
        return lead
      }),
    remove: (id) =>
      run(() => {
        guard('lead', 'delete')
        removeWhere(db.lead_activity, (row) => row.lead_id === id)
        removeWhere(db.leads, (row) => row.id === id)
      }),
    listActivity: (leadId) =>
      run(() => {
        guard('lead', 'view')
        return db.lead_activity.filter((row) => row.lead_id === leadId).sort((a, b) => a.created_at.localeCompare(b.created_at))
      }),
    importMany: (rows) =>
      run(() => {
        guard('lead', 'create')
        if (rows.some((row) => !row.company?.trim())) throw new DataError('invalid', 'Every row needs a company.')
        return rows.map((input) => {
          const lead = newLead(input)
          db.leads.push(lead)
          logLead(lead.id, 'imported', 'Imported from CSV')
          return lead
        })
      }),
    convertToClient: (id) =>
      run(() => {
        const profile = guard('lead', 'edit')
        guard('client', 'create')
        const lead = db.leads.find((row) => row.id === id)
        if (!lead) throw new DataError('not_found', `No lead ${id}`)
        if (lead.stage !== 'closed_won') throw new DataError('invalid', 'Only a Closed Won lead can become a client.')
        if (lead.converted_client_id) throw new DataError('invalid', 'This lead is already a client.')
        const client = insertClient(
          {
            name: lead.company,
            slug: lead.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
            industry: lead.industry,
            city: lead.city,
            billing_email: lead.email,
          },
          profile,
        )
        lead.converted_client_id = client.id
        logLead(id, 'converted', `Converted to client ${client.name}`)
        return client
      }),
  },

  reminders: {
    list: () =>
      run(() => {
        guard('reminder', 'view')
        return [...db.reminders].sort((a, b) => a.due_at.localeCompare(b.due_at))
      }),
    update: (id, patch) =>
      run(() => {
        guard('reminder', 'edit')
        const reminder = db.reminders.find((row) => row.id === id)
        if (!reminder) throw new DataError('not_found', `No reminder ${id}`)
        if (patch.status) {
          reminder.status = patch.status
          reminder.sent_at = patch.status === 'sent' ? nowIso() : null
        }
        return reminder
      }),
  },

  aiDrafts: {
    list: () =>
      run(() => {
        guard('ai_draft', 'view')
        return [...db.ai_drafts].sort((a, b) => b.created_at.localeCompare(a.created_at))
      }),
    update: (id, patch) =>
      run(() => {
        guard('ai_draft', 'edit')
        const draft = readDraft(id)
        if (draft.status !== 'draft') throw new DataError('invalid', 'Only a draft can be edited.')
        if (patch.body !== undefined && !patch.body.trim()) throw new DataError('invalid', 'The text cannot be empty.')
        Object.assign(draft, patch, { updated_at: nowIso() })
        return draft
      }),
    approve: (id) =>
      run(() => {
        guard('ai_draft', 'edit')
        const draft = readDraft(id)
        if (draft.status !== 'draft') throw new DataError('invalid', 'Only a draft can be approved.')
        draft.status = 'approved'
        draft.updated_at = nowIso()
        return draft
      }),
    markSent: (id) =>
      run(() => {
        guard('ai_draft', 'edit')
        const draft = readDraft(id)
        if (draft.status !== 'approved') throw new DataError('invalid', 'Approve a draft before sending it.')
        draft.status = 'sent'
        draft.updated_at = nowIso()
        return draft
      }),
  },
}
