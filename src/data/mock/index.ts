import { invoiceTotals, itemAmount } from '../../lib/money'
import { can } from '../../lib/permissions'
import type { CommentTarget, InvoiceItem, Profile } from '../../types/db'
import { DataError } from '../types'
import type { DataLayer } from '../types'
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

export const mockData: DataLayer = {
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
      run(() => {
        const profile = guard('client', 'create')
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
      }),
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
          db.revisions,
          db.comments,
          db.files,
          db.service_requests,
          db.invoices,
          db.action_items,
          db.feedback,
          db.social_metrics_daily,
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
    createClientUser: (input) =>
      run(() => {
        guard('client_user', 'create', input.client_id)
        if (input.role !== 'client_admin' && input.role !== 'client_member') {
          throw new DataError('invalid', 'A client user must be a client admin or a client member.')
        }
        const profile = {
          phone_e164: null,
          avatar_url: null,
          can_approve: input.role === 'client_admin',
          is_active: true,
          ...input,
          id: newId(),
          created_at: nowIso(),
        }
        db.profiles.push(profile)
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
        writable(db.milestones, id, 'milestone', 'delete')
        for (const deliverable of db.deliverables) {
          if (deliverable.milestone_id === id) deliverable.milestone_id = null
        }
        removeWhere(db.milestones, (row) => row.id === id)
      }),
  },

  deliverables: {
    list: (filter = {}) =>
      run(() => {
        const profile = guard('deliverable', 'view', filter.client_id)
        return visible(db.deliverables, profile).filter(
          (row) =>
            (!filter.client_id || row.client_id === filter.client_id) &&
            (!filter.project_id || row.project_id === filter.project_id) &&
            (!filter.status || row.status === filter.status),
        )
      }),
    get: (id) => run(() => readOne(db.deliverables, id, 'deliverable')),
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
    approve: (id) =>
      run(() => {
        const deliverable = writable(db.deliverables, id, 'deliverable', 'approve')
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
        const deliverable = readOne(db.deliverables, filter.deliverable_id, 'revision')
        return db.revisions
          .filter((row) => row.deliverable_id === deliverable.id)
          .sort((a, b) => a.revision_number - b.revision_number)
      }),
    request: (input) =>
      run(() => {
        const deliverable = writable(db.deliverables, input.deliverable_id, 'deliverable', 'request_revision')
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
          description: input.description,
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
    update: (id, patch) => run(() => Object.assign(writable(db.invoices, id, 'invoice', 'edit'), patch)),
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
          status: 'new' as const,
          submitted_by: profile.id,
          created_at: nowIso(),
          responded_at: null,
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
  },

  leads: {
    list: () =>
      run(() => {
        guard('lead', 'view')
        return db.leads
      }),
  },
}
