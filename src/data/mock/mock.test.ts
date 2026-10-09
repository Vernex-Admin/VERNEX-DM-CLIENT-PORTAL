import { beforeEach, describe, expect, it } from 'vitest'
import { mockData as data } from '.'
import { createSeed, SEED_IDS } from './seed'
import { resetMockData } from './store'

const { agk, raack } = SEED_IDS

const signInAs = (profileId: string | null) => data.session.switchProfile(profileId)

beforeEach(() => {
  resetMockData()
})

const clientUsers = [
  ['AGK admin', SEED_IDS.agkAdmin, agk, raack],
  ['AGK member', SEED_IDS.agkMember, agk, raack],
  ['Raack admin', SEED_IDS.raackAdmin, raack, agk],
  ['Raack member', SEED_IDS.raackMember, raack, agk],
] as const

describe.each(clientUsers)('%s', (_name, profileId, ownId, otherId) => {
  beforeEach(async () => {
    await signInAs(profileId)
  })

  const onlyOwn = (rows: { client_id: string }[]) => {
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.client_id === ownId)).toBe(true)
  }

  it('lists only their own client', async () => {
    const clients = await data.clients.list()
    expect(clients.map((client) => client.id)).toEqual([ownId])
    await expect(data.clients.get(otherId)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('lists only their own rows without a filter', async () => {
    onlyOwn(await data.projects.list())
    onlyOwn(await data.deliverables.list())
    onlyOwn(await data.invoices.list())
    onlyOwn(await data.actionItems.list())
    onlyOwn(await data.serviceRequests.list())
  })

  it('is refused when filtering by the other client', async () => {
    const filter = { client_id: otherId }
    await expect(data.projects.list(filter)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.deliverables.list(filter)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.invoices.list(filter)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.actionItems.list(filter)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.serviceRequests.list(filter)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.files.list(filter)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.socialMetrics.listDaily(filter)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.profiles.listByClient(otherId)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('cannot fetch the other client’s records by id', async () => {
    const other = createSeed()
    const project = other.projects.find((row) => row.client_id === otherId)!
    const deliverable = other.deliverables.find((row) => row.client_id === otherId)!
    const invoice = other.invoices.find((row) => row.client_id === otherId && row.status !== 'draft')!
    await expect(data.projects.get(project.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(data.deliverables.get(deliverable.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(data.invoices.get(invoice.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(data.milestones.list({ project_id: project.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(data.revisions.list({ deliverable_id: deliverable.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(data.comments.list({ target_type: 'deliverable', target_id: deliverable.id })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('cannot act on the other client', async () => {
    const other = createSeed()
    const deliverable = other.deliverables.find((row) => row.client_id === otherId && row.status === 'in_review')!
    await expect(data.deliverables.approve(deliverable.id)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.serviceRequests.submit({ client_id: otherId, title: 'x' })).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(
      data.files.uploadBrandAsset({ client_id: otherId, name: 'x.png' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('never sees leads, the Founder Box inbox or internal comments', async () => {
    await expect(data.leads.list()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.founderBox.listInbox()).rejects.toMatchObject({ code: 'forbidden' })

    const seeded = createSeed()
    const internal = seeded.comments.find((row) => row.client_id === ownId && row.visibility === 'internal')
    if (internal) {
      const comments = await data.comments.list({ target_type: internal.target_type, target_id: internal.target_id })
      expect(comments.some((comment) => comment.visibility === 'internal')).toBe(false)
    }
    await expect(
      data.comments.create({
        target_type: 'deliverable',
        target_id: seeded.deliverables.find((row) => row.client_id === ownId)!.id,
        body: 'x',
        visibility: 'internal',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('cannot see draft invoices', async () => {
    const invoices = await data.invoices.list()
    expect(invoices.some((invoice) => invoice.status === 'draft')).toBe(false)
  })

  it('cannot create, edit or delete admin-managed records', async () => {
    const seeded = createSeed()
    const project = seeded.projects.find((row) => row.client_id === ownId)!
    const invoice = seeded.invoices.find((row) => row.client_id === ownId && row.status !== 'draft')!

    await expect(data.clients.create({ name: 'New', slug: 'new' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.clients.update(ownId, { city: 'Madurai' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.clients.remove(ownId)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.projects.create({ client_id: ownId, name: 'New', type: 'web' })).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(data.projects.update(project.id, { name: 'Renamed' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.projects.remove(project.id)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      data.invoices.create({
        client_id: ownId,
        issue_date: '2026-10-01',
        due_date: '2026-10-15',
        items: [{ description: 'x', unit_price_minor: 100 }],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.invoices.update(invoice.id, { status: 'paid' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.invoices.remove(invoice.id)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      data.milestones.create({ project_id: project.id, title: 'x' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      data.deliverables.create({ project_id: project.id, title: 'x', kind: 'post' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      data.profiles.createClientUser({
        client_id: ownId,
        email: 'x@example.com',
        full_name: 'X',
        role: 'client_member',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })

    // Nothing changed.
    const after = await data.projects.get(project.id)
    expect(after.name).toBe(project.name)
  })

  it('can submit a service request, upload a brand asset, comment and write to the founder', async () => {
    const seeded = createSeed()
    const deliverable = seeded.deliverables.find((row) => row.client_id === ownId)!

    const request = await data.serviceRequests.submit({ client_id: ownId, title: 'Extra reel' })
    expect(request.client_id).toBe(ownId)

    const asset = await data.files.uploadBrandAsset({ client_id: ownId, name: 'palette.pdf' })
    expect(asset.client_id).toBe(ownId)
    expect(asset.folder).toBe('brand_assets')

    const comment = await data.comments.create({ target_type: 'deliverable', target_id: deliverable.id, body: 'Looks good' })
    expect(comment.visibility).toBe('client')

    const before = (await data.founderBox.listMine()).length
    const message = await data.founderBox.send({ category: 'idea', subject: 'Idea', message: 'A thought' })
    expect(message.client_id).toBe(ownId)
    expect(await data.founderBox.listMine()).toHaveLength(before + 1)
  })
})

describe('client A and client B', () => {
  it('never see each other’s rows, in either direction', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    const agkProjects = (await data.projects.list()).map((row) => row.id)
    const agkInvoices = (await data.invoices.list()).map((row) => row.id)

    await signInAs(SEED_IDS.raackAdmin)
    const raackProjects = (await data.projects.list()).map((row) => row.id)
    const raackInvoices = (await data.invoices.list()).map((row) => row.id)

    expect(agkProjects.filter((id) => raackProjects.includes(id))).toEqual([])
    expect(agkInvoices.filter((id) => raackInvoices.includes(id))).toEqual([])
  })

  it('stop seeing the previous user’s data after switching profiles', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    expect((await data.clients.list()).map((client) => client.id)).toEqual([agk])
    await signInAs(SEED_IDS.raackAdmin)
    expect((await data.clients.list()).map((client) => client.id)).toEqual([raack])
  })

  it('are refused everything when signed out', async () => {
    await signInAs(null)
    await expect(data.clients.list()).rejects.toMatchObject({ code: 'signed_out' })
    await expect(data.projects.list()).rejects.toMatchObject({ code: 'signed_out' })
  })
})

describe('a client_member without can_approve', () => {
  const seeded = createSeed()
  const inReview = seeded.deliverables.find((row) => row.client_id === agk && row.status === 'in_review')!

  beforeEach(async () => {
    await signInAs(SEED_IDS.agkMember)
  })

  it('is refused when approving', async () => {
    await expect(data.deliverables.approve(inReview.id)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('is refused when requesting a revision', async () => {
    await expect(
      data.revisions.request({ deliverable_id: inReview.id, description: 'Change the ending' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('leaves the deliverable untouched', async () => {
    await expect(data.deliverables.approve(inReview.id)).rejects.toThrow()
    await signInAs(SEED_IDS.founder)
    const after = await data.deliverables.get(inReview.id)
    expect(after.status).toBe('in_review')
    expect(after.approved_by).toBeNull()
    expect(after.revisions_used).toBe(inReview.revisions_used)
  })

  it('can approve once Vernex switches can_approve on', async () => {
    await signInAs(SEED_IDS.pm)
    await data.profiles.update(SEED_IDS.agkMember, { can_approve: true })
    await signInAs(SEED_IDS.agkMember)
    const approved = await data.deliverables.approve(inReview.id)
    expect(approved.status).toBe('approved')
    expect(approved.approved_by).toBe(SEED_IDS.agkMember)
  })
})

describe('a client_member with can_approve', () => {
  it('can approve and request revisions on their own client', async () => {
    await signInAs(SEED_IDS.raackMember)
    const approved = await data.deliverables.approve('d-raack-1')
    expect(approved.status).toBe('approved')
  })
})

describe('admin roles', () => {
  it('see every client (founder) or their assigned clients (PM)', async () => {
    await signInAs(SEED_IDS.founder)
    expect((await data.clients.list()).map((client) => client.id).sort()).toEqual([agk, raack].sort())
    await signInAs(SEED_IDS.pm)
    expect((await data.clients.list()).map((client) => client.id).sort()).toEqual([agk, raack].sort())
  })

  it('see leads, and only the founder reads the Founder Box inbox', async () => {
    await signInAs(SEED_IDS.pm)
    expect((await data.leads.list()).length).toBeGreaterThan(0)
    await expect(data.founderBox.listInbox()).rejects.toMatchObject({ code: 'forbidden' })
    await signInAs(SEED_IDS.founder)
    expect((await data.founderBox.listInbox()).length).toBeGreaterThan(0)
  })

  it('see internal comments and draft invoices', async () => {
    await signInAs(SEED_IDS.pm)
    const comments = await data.comments.list({ target_type: 'deliverable', target_id: 'd-agk-1' })
    expect(comments.some((comment) => comment.visibility === 'internal')).toBe(true)
    expect((await data.invoices.list()).some((invoice) => invoice.status === 'draft')).toBe(true)
  })

  it('create, edit and delete a project', async () => {
    await signInAs(SEED_IDS.pm)
    const project = await data.projects.create({ client_id: agk, name: 'Launch', type: 'web' })
    const renamed = await data.projects.update(project.id, { name: 'Launch v2' })
    expect(renamed.name).toBe('Launch v2')
    await data.projects.remove(project.id)
    await expect(data.projects.get(project.id)).rejects.toMatchObject({ code: 'not_found' })
  })
})
