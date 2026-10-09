import { beforeEach, describe, expect, it } from 'vitest'
import { mockData as data } from '.'
import { can, POLICY } from '../../lib/permissions'
import type { Action, Resource } from '../../lib/permissions'
import type { UserRole } from '../../types/db'
import { SEED_IDS } from './seed'
import { db, resetMockData } from './store'

// Item 5 of the admin console brief: a client role cannot call ANY admin mutation.

const { agk, raack } = SEED_IDS

beforeEach(() => resetMockData())

/** Every write the admin console makes, aimed at the signed-in client's own records and at another client's. */
function adminMutations(ownId: string, otherId: string): Array<[string, () => Promise<unknown>]> {
  const mine = {
    project: db.projects.find((row) => row.client_id === ownId)!,
    deliverable: db.deliverables.find((row) => row.client_id === ownId)!,
    invoice: db.invoices.find((row) => row.client_id === ownId)!,
    revision: db.revisions.find((row) => row.client_id === ownId)!,
    request: db.service_requests.find((row) => row.client_id === ownId)!,
    action: db.action_items.find((row) => row.client_id === ownId)!,
    file: db.files.find((row) => row.client_id === ownId)!,
    user: db.profiles.find((row) => row.client_id === ownId && row.role === 'client_member')!,
    milestone: db.milestones.find((row) => row.client_id === ownId)!,
  }
  const theirs = {
    project: db.projects.find((row) => row.client_id === otherId)!,
    deliverable: db.deliverables.find((row) => row.client_id === otherId)!,
  }

  return [
    ['clients.create', () => data.clients.create({ name: 'New', slug: 'new' })],
    ['clients.update', () => data.clients.update(ownId, { city: 'Madurai' })],
    ['clients.update (other)', () => data.clients.update(otherId, { city: 'Madurai' })],
    ['clients.remove', () => data.clients.remove(ownId)],
    ['profiles.listStaff', () => data.profiles.listStaff()],
    ['profiles.setAccountLead', () => data.profiles.setAccountLead(ownId, SEED_IDS.founder)],
    ['profiles.createClientUser', () => data.profiles.createClientUser({ client_id: ownId, email: 'n@x.example', full_name: 'N', role: 'client_member' })],
    ['profiles.update (can_approve)', () => data.profiles.update(mine.user.id, { can_approve: true })],
    ['profiles.remove', () => data.profiles.remove(mine.user.id)],
    ['projects.create', () => data.projects.create({ client_id: ownId, name: 'P', type: 'web' })],
    ['projects.update', () => data.projects.update(mine.project.id, { name: 'Renamed' })],
    ['projects.update (other)', () => data.projects.update(theirs.project.id, { name: 'Renamed' })],
    ['projects.remove', () => data.projects.remove(mine.project.id)],
    ['milestones.create', () => data.milestones.create({ project_id: mine.project.id, title: 'M' })],
    ['milestones.update', () => data.milestones.update(mine.milestone.id, { title: 'M' })],
    ['milestones.remove', () => data.milestones.remove(mine.milestone.id)],
    ['milestones.reorder', () => data.milestones.reorder(mine.milestone.project_id, db.milestones.filter((row) => row.project_id === mine.milestone.project_id).map((row) => row.id).reverse())],
    ['deliverables.create', () => data.deliverables.create({ project_id: mine.project.id, title: 'D', kind: 'post' })],
    ['deliverables.update (visibility)', () => data.deliverables.update(mine.deliverable.id, { visibility: 'internal' })],
    ['deliverables.update (other)', () => data.deliverables.update(theirs.deliverable.id, { title: 'x' })],
    ['deliverables.remove', () => data.deliverables.remove(mine.deliverable.id)],
    ['deliverables.publishVersion', () => data.deliverables.publishVersion(mine.deliverable.id, { preview_kind: 'drive', preview_url: 'https://drive.google.com/file/d/x/preview' })],
    ['revisions.update', () => data.revisions.update(mine.revision.id, { status: 'delivered' })],
    ['revisions.grantBonus', () => data.revisions.grantBonus({ deliverable_id: mine.deliverable.id, reason: 'Client asked nicely' })],
    ['serviceRequests.update', () => data.serviceRequests.update(mine.request.id, { status: 'accepted', quote_amount_minor: 1 })],
    ['invoices.create', () => data.invoices.create({ client_id: ownId, issue_date: '2026-10-01', due_date: '2026-10-15', items: [{ description: 'x', unit_price_minor: 100 }] })],
    ['invoices.update', () => data.invoices.update(mine.invoice.id, { status: 'paid' })],
    ['invoices.update (items)', () => data.invoices.update(mine.invoice.id, { items: [{ description: 'x', unit_price_minor: 1 }] })],
    ['invoices.remove', () => data.invoices.remove(mine.invoice.id)],
    ['actionItems.create', () => data.actionItems.create({ client_id: ownId, type: 'info_request', title: 'x' })],
    ['actionItems.resolve', () => data.actionItems.resolve(mine.action.id)],
    ['actionItems.remove', () => data.actionItems.remove(mine.action.id)],
    ['files.remove', () => data.files.remove(mine.file.id)],
    ['leads.create', () => data.leads.create({ company: 'x' })],
    ['leads.update', () => data.leads.update('l-1', { stage: 'closed_won' })],
    ['leads.remove', () => data.leads.remove('l-1')],
    ['leads.listActivity', () => data.leads.listActivity('l-1')],
    ['leads.importMany', () => data.leads.importMany([{ company: 'x' }])],
    ['leads.convertToClient', () => data.leads.convertToClient('l-8')],
    ['reminders.list', () => data.reminders.list()],
    ['reminders.update', () => data.reminders.update('rm-1', { status: 'sent' })],
    ['aiDrafts.list', () => data.aiDrafts.list()],
    ['aiDrafts.update', () => data.aiDrafts.update('ai-1', { body: 'x' })],
    ['aiDrafts.approve', () => data.aiDrafts.approve('ai-1')],
    ['aiDrafts.markSent', () => data.aiDrafts.markSent('ai-2')],
    ['founderBox.reply', () => data.founderBox.reply('fb-agk-1', 'x')],
    ['founderBox.setStatus', () => data.founderBox.setStatus('fb-agk-1', 'resolved')],
  ]
}

const snapshot = () => JSON.stringify(db)

describe.each([
  ['client_admin', SEED_IDS.agkAdmin, agk, raack],
  ['client_member', SEED_IDS.agkMember, agk, raack],
] as const)('%s', (_role, profileId, ownId, otherId) => {
  it('is refused by every admin mutation, and nothing changes', async () => {
    await data.session.switchProfile(profileId)
    const mutations = adminMutations(ownId, otherId)
    // Guard against the list silently shrinking.
    expect(mutations.length).toBeGreaterThanOrEqual(30)

    const before = snapshot()
    for (const [name, call] of mutations) {
      await expect(call(), name).rejects.toMatchObject({ code: 'forbidden' })
    }
    expect(snapshot()).toBe(before)
  })

  it('has no admin permission in the policy that useCan() reads', () => {
    const adminResources: Resource[] = ['client', 'client_user', 'project', 'milestone', 'deliverable', 'invoice', 'action_item', 'lead']
    const writes: Action[] = ['create', 'edit', 'delete']
    const profile = { ...db.profiles.find((row) => row.id === profileId)!, is_active: true }
    for (const resource of adminResources) {
      for (const action of writes) {
        // The only client write on these resources is creating a service request, which is not listed here.
        expect(can(profile, resource, action, { clientId: ownId }), `${resource}:${action}`).toBe(false)
      }
    }
    expect(can(profile, 'revision', 'edit', { clientId: ownId })).toBe(false)
    expect(can(profile, 'brand_asset', 'delete', { clientId: ownId })).toBe(false)
    expect(can(profile, 'service_request', 'edit', { clientId: ownId })).toBe(false)
  })
})

describe('admin roles', () => {
  it('give both Vernex roles every admin write the console uses', () => {
    const roles: UserRole[] = ['vernex_founder', 'vernex_pm']
    const needed = [
      'client:create', 'client:edit', 'client:delete', 'client_user:create', 'client_user:edit', 'client_user:delete',
      'project:create', 'project:edit', 'project:delete', 'milestone:create', 'milestone:edit', 'milestone:delete',
      'deliverable:create', 'deliverable:edit', 'deliverable:delete', 'revision:edit', 'service_request:edit',
      'invoice:create', 'invoice:edit', 'invoice:delete',
    ]
    for (const role of roles) {
      for (const permission of needed) expect(POLICY[role], `${role} ${permission}`).toContain(permission)
    }
  })

  it('keep the Founder Box to the founder: a PM can neither read nor answer it', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    const before = snapshot()
    await expect(data.founderBox.listInbox()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.founderBox.reply('fb-agk-1', 'x')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.founderBox.setStatus('fb-agk-1', 'resolved')).rejects.toMatchObject({ code: 'forbidden' })
    expect(snapshot()).toBe(before)
  })

  it('log lead stage moves and edits, and only move forward through valid values', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    await data.leads.update('l-4', { stage: 'responded', next_action: 'Call them' })
    const log = (await data.leads.listActivity('l-4')).map((row) => row.text)
    expect(log).toContain('Moved from Outreach Sent to Responded')
    expect(log).toContain('Edited next action')
    await expect(data.leads.update('l-4', { score: 101 })).rejects.toMatchObject({ code: 'invalid' })
    await expect(data.leads.update('l-4', { company: ' ' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(data.leads.importMany([{ company: 'ok' }, { company: '' }])).rejects.toMatchObject({ code: 'invalid' })
  })

  it('walk a draft through draft, approved, sent in order only', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    await expect(data.aiDrafts.markSent('ai-1')).rejects.toMatchObject({ code: 'invalid' })
    await data.aiDrafts.approve('ai-1')
    await expect(data.aiDrafts.update('ai-1', { body: 'late edit' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(data.aiDrafts.approve('ai-1')).rejects.toMatchObject({ code: 'invalid' })
    expect((await data.aiDrafts.markSent('ai-1')).status).toBe('sent')
  })

  it('never show a client internal work', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    const created = await data.deliverables.create({ project_id: 'p-agk-social', title: 'Secret draft', kind: 'post' })
    expect(created.visibility).toBe('internal')

    await data.session.switchProfile(SEED_IDS.agkAdmin)
    expect((await data.deliverables.list()).some((row) => row.id === created.id)).toBe(false)
    await expect(data.deliverables.get(created.id)).rejects.toMatchObject({ code: 'not_found' })

    await data.session.switchProfile(SEED_IDS.pm)
    await data.deliverables.publishVersion(created.id, { preview_kind: 'drive', preview_url: 'https://drive.google.com/file/d/abc/view', visibility: 'client' })
    await data.session.switchProfile(SEED_IDS.agkAdmin)
    const shown = await data.deliverables.get(created.id)
    expect(shown.status).toBe('in_review')
    const open = await data.actionItems.list({ open: true })
    expect(open.some((item) => item.ref_id === created.id && item.type === 'approval')).toBe(true)
  })

  it('require a reason for a bonus revision and log it', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    await expect(data.revisions.grantBonus({ deliverable_id: 'd-agk-1', reason: ' ' })).rejects.toMatchObject({ code: 'invalid' })
    const before = db.deliverables.find((row) => row.id === 'd-agk-1')!.revision_limit
    const after = await data.revisions.grantBonus({ deliverable_id: 'd-agk-1', reason: 'Founder approved an extra round' })
    expect(after.revision_limit).toBe(before + 1)
    expect(db.revision_grants.at(-1)).toMatchObject({ deliverable_id: 'd-agk-1', reason: 'Founder approved an extra round', granted_by: SEED_IDS.pm })
  })

  it('reorder milestones and reject a partial order', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    const ids = (await data.milestones.list({ project_id: 'p-agk-social' })).map((row) => row.id)
    expect(ids.length).toBeGreaterThan(1)
    const reversed = [...ids].reverse()
    const result = await data.milestones.reorder('p-agk-social', reversed)
    expect(result.map((row) => row.id)).toEqual(reversed)
    await expect(data.milestones.reorder('p-agk-social', ids.slice(1))).rejects.toMatchObject({ code: 'invalid' })
  })

  it('replace an invoice\'s lines and recompute its GST', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    const updated = await data.invoices.update('inv-agk-3', { items: [{ description: 'Retainer', unit_price_minor: 1_000_000 }, { description: 'Extra reel', unit_price_minor: 500_000, quantity: 2 }] })
    expect(updated.subtotal_minor).toBe(2_000_000)
    expect(updated.total_minor).toBe(2_360_000)
    expect((await data.invoices.get('inv-agk-3')).items).toHaveLength(2)
  })

  it('set one account lead per client', async () => {
    await data.session.switchProfile(SEED_IDS.founder)
    await data.profiles.setAccountLead(agk, SEED_IDS.founder)
    const leads = (await data.profiles.listAccountLeads()).filter((row) => row.client_id === agk)
    expect(leads).toEqual([{ client_id: agk, user_id: SEED_IDS.founder, is_account_lead: true }])
  })
})
