import { beforeEach, describe, expect, it } from 'vitest'
import { mockData as data } from '.'
import { createSeed, SEED_IDS } from './seed'
import { resetMockData } from './store'

const { agk, raack } = SEED_IDS

beforeEach(() => {
  resetMockData()
})

describe('seed', () => {
  it('holds the 48 checklist rows and 11 templates from the playbook SQL', () => {
    const seed = createSeed()
    expect(seed.onboarding_item_templates).toHaveLength(48)
    expect(seed.message_templates).toHaveLength(11)
  })

  it('gives AGK Fitness a "both" checklist with some items done', async () => {
    await data.session.switchProfile(SEED_IDS.founder)
    const items = await data.onboarding.list(agk)
    const services = new Set(items.map((item) => item.service))
    expect(services).toEqual(new Set(['common', 'social', 'website']))
    expect(items.some((item) => item.status === 'done')).toBe(true)
    expect(items.some((item) => item.status === 'todo')).toBe(true)
  })
})

describe('staff', () => {
  beforeEach(async () => {
    await data.session.switchProfile(SEED_IDS.founder)
  })

  it('generates a "both" checklist with common, social and website rows, in order', async () => {
    const items = await data.onboarding.generate(raack, 'both')
    expect(items).toHaveLength(48)
    expect(items.map((item) => item.position)).toEqual(items.map((_, index) => index + 1))
    const order = items.map((item) => item.service)
    expect(order.indexOf('social')).toBeGreaterThan(order.lastIndexOf('common'))
    expect(order.indexOf('website')).toBeGreaterThan(order.lastIndexOf('social'))
    expect((await data.clients.get(raack)).service_type).toBe('both')
  })

  it('generates only common and the chosen service', async () => {
    const items = await data.onboarding.generate(raack, 'website')
    expect(new Set(items.map((item) => item.service))).toEqual(new Set(['common', 'website']))
    expect(items).toHaveLength(29)
  })

  it('reports both gates for AGK Fitness and neither for Raack', async () => {
    expect((await data.onboarding.gates(agk)).agreement_signed).toBe(true)
    expect(await data.onboarding.gates(raack)).toMatchObject({ agreement_signed: false })
  })

  it('lists drafts to staff, and mark sent / signed set the timestamps', async () => {
    const docs = await data.documents.list(raack)
    const draft = docs.find((doc) => doc.status === 'draft')
    expect(draft).toBeTruthy()
    const sent = await data.documents.update(draft!.id, { status: 'sent' })
    expect(sent.sent_at).not.toBeNull()
    const signed = await data.documents.update(draft!.id, { status: 'signed' })
    expect(signed.signed_at).not.toBeNull()
  })

  it('edits a template', async () => {
    const first = (await data.templates.list())[0]!
    const saved = await data.templates.update(first.id, { body: 'Hello {{client_name}}' })
    expect(saved.body).toBe('Hello {{client_name}}')
  })
})

describe('client users', () => {
  beforeEach(async () => {
    await data.session.switchProfile(SEED_IDS.agkAdmin)
  })

  it("can't list message templates or edit them", async () => {
    await expect(data.templates.list()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.templates.update('mt-1', { body: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it("can't see draft documents", async () => {
    await data.session.switchProfile(SEED_IDS.raackAdmin)
    const docs = await data.documents.list(raack)
    expect(docs.length).toBeGreaterThan(0)
    expect(docs.every((doc) => doc.status === 'sent' || doc.status === 'signed')).toBe(true)
  })

  it('see only client-owned items', async () => {
    const items = await data.onboarding.list(agk)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.owner === 'client')).toBe(true)
  })

  it("can't generate a checklist or read another client's", async () => {
    await expect(data.onboarding.generate(agk, 'social')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.onboarding.list(raack)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('submit saves the answers and ticks matching client items only', async () => {
    const items = await data.onboarding.list(agk)
    const todo = items.find((item) => item.status === 'todo')!
    const client = await data.onboarding.submit({ social_goal: 'More enquiries' }, [todo.id])
    expect(client.onboarding_answers).toEqual({ social_goal: 'More enquiries' })
    const after = await data.onboarding.list(agk)
    expect(after.find((item) => item.id === todo.id)?.status).toBe('done')

    // A Vernex-owned item id is ignored.
    await data.session.switchProfile(SEED_IDS.founder)
    const vernexItem = (await data.onboarding.list(agk)).find((item) => item.owner === 'vernex' && item.status === 'todo')!
    await data.session.switchProfile(SEED_IDS.agkAdmin)
    await data.onboarding.submit({}, [vernexItem.id])
    await data.session.switchProfile(SEED_IDS.founder)
    const still = (await data.onboarding.list(agk)).find((item) => item.id === vernexItem.id)
    expect(still?.status).toBe('todo')
  })
})

describe('staff management (founder only)', () => {
  it('lets the founder add a PM, assign clients and deactivate them', async () => {
    await data.session.switchProfile(SEED_IDS.founder)
    const pm = await data.profiles.createStaff({ email: 'New.PM@vernex.example', full_name: 'New PM' })
    expect(pm).toMatchObject({ role: 'vernex_pm', client_id: null, email: 'new.pm@vernex.example' })
    await expect(data.profiles.createStaff({ email: 'new.pm@vernex.example', full_name: 'Again' })).rejects.toMatchObject({
      code: 'invalid',
    })

    await data.profiles.assignToClient(agk, pm.id)
    expect((await data.profiles.listAssignments()).some((row) => row.user_id === pm.id && row.client_id === agk)).toBe(true)
    await data.profiles.unassignFromClient(agk, pm.id)
    expect((await data.profiles.listAssignments()).some((row) => row.user_id === pm.id)).toBe(false)

    const off = await data.profiles.setActive(pm.id, false)
    expect(off.is_active).toBe(false)
  })

  it('refuses a PM and a client user', async () => {
    await data.session.switchProfile(SEED_IDS.pm)
    await expect(data.profiles.createStaff({ email: 'x@y.example', full_name: 'X' })).rejects.toMatchObject({ code: 'forbidden' })
    await data.session.switchProfile(SEED_IDS.agkAdmin)
    await expect(data.profiles.listAssignments()).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('social metrics import', () => {
  it('lets staff add and replace days, and refuses a client user', async () => {
    await data.session.switchProfile(SEED_IDS.founder)
    const row = {
      client_id: agk,
      platform: 'instagram',
      date: '2026-10-01',
      followers: 10,
      reach: 20,
      impressions: 30,
      engagements: 4,
      profile_visits: 5,
      leads: 1,
      ad_spend_minor: 10000,
    }
    expect(await data.socialMetrics.importDaily([row])).toBe(1)
    expect(await data.socialMetrics.importDaily([{ ...row, reach: 99 }])).toBe(1)
    const days = await data.socialMetrics.listDaily({ client_id: agk, days: 365 })
    expect(days.filter((d) => d.date === '2026-10-01' && d.platform === 'instagram')).toHaveLength(1)

    await data.session.switchProfile(SEED_IDS.agkAdmin)
    await expect(data.socialMetrics.importDaily([row])).rejects.toMatchObject({ code: 'forbidden' })
  })
})
