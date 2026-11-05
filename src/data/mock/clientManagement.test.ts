import { beforeEach, describe, expect, it } from 'vitest'
import { mockData as data } from '.'
import { SEED_IDS, SEED_PASSWORDS } from './seed'
import { db, resetMockData } from './store'

const { agk, raack } = SEED_IDS
const signInAs = (profileId: string | null) => data.session.switchProfile(profileId)

beforeEach(() => {
  resetMockData()
})

describe('Client Codes', () => {
  it('gives every new client the next unique code, whatever the caller sends', async () => {
    const first = await data.clients.create({ name: 'Zen Yoga', slug: 'zen-yoga', client_code: 'VXC-0001' })
    const second = await data.clients.create({ name: 'Blue Cafe', slug: 'blue-cafe' })
    expect(first.client_code).toBe('VXC-1003')
    expect(second.client_code).toBe('VXC-1004')
    expect(new Set(db.clients.map((client) => client.client_code)).size).toBe(db.clients.length)
  })

  it('never changes a code on update', async () => {
    const updated = await data.clients.update(agk, { name: 'AGK Fitness Studio', client_code: 'VXC-9999' })
    expect(updated.client_code).toBe('VXC-1001')
  })
})

describe('signing in', () => {
  it('lets a client in with their Client Code and password, in any case', async () => {
    await signInAs(null)
    const session = await data.auth.signInWithIdentifier({ identifier: 'vxc-1001', password: SEED_PASSWORDS.agkAdmin })
    expect(session.user.id).toBe(SEED_IDS.agkAdmin)
  })

  it('refuses a wrong password, an unknown code, and a client email', async () => {
    await signInAs(null)
    await expect(data.auth.signInWithIdentifier({ identifier: 'VXC-1001', password: 'Wrong-1234' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(data.auth.signInWithIdentifier({ identifier: 'VXC-7777', password: SEED_PASSWORDS.agkAdmin })).rejects.toMatchObject({ code: 'invalid' })
    await expect(
      data.auth.signInWithIdentifier({ identifier: 'arun@agkfitness.example', password: SEED_PASSWORDS.agkAdmin }),
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(await data.session.getCurrentProfile()).toBeNull()
  })

  it('lets Vernex staff in with their email', async () => {
    await signInAs(null)
    const session = await data.auth.signInWithIdentifier({ identifier: 'admin@vernex.in', password: 'anything-1' })
    expect(session.user.id).toBe(SEED_IDS.founder)
  })

  it('refuses a person whose sign-in Vernex turned off', async () => {
    await data.profiles.update(SEED_IDS.agkAdmin, { is_active: false })
    await signInAs(null)
    await expect(data.auth.signInWithIdentifier({ identifier: 'VXC-1001', password: SEED_PASSWORDS.agkAdmin })).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('logins', () => {
  it('gives the next person of a client the code with a number, and a new password replaces the old one', async () => {
    const issued = await data.access.issue({ profile_id: SEED_IDS.raackMember, password: 'Sanjay-2026' })
    expect(issued).toMatchObject({ login_code: 'VXC-1002-2', password: 'Sanjay-2026', set_by: 'vernex' })
    expect(db.profiles.find((row) => row.id === SEED_IDS.raackMember)?.login_code).toBe('VXC-1002-2')

    const reset = await data.access.issue({ profile_id: SEED_IDS.raackMember, password: 'Fresh-4321' })
    expect(reset.login_code).toBe('VXC-1002-2')
    await signInAs(null)
    await expect(data.auth.signInWithIdentifier({ identifier: 'VXC-1002-2', password: 'Sanjay-2026' })).rejects.toBeTruthy()
    const session = await data.auth.signInWithIdentifier({ identifier: 'VXC-1002-2', password: 'Fresh-4321' })
    expect(session.user.id).toBe(SEED_IDS.raackMember)
  })

  it('makes a new client’s first person sign in with the Client Code itself', async () => {
    const client = await data.clients.create({ name: 'Zen Yoga', slug: 'zen-yoga' })
    const person = await data.profiles.createClientUser({ client_id: client.id, full_name: 'Meera', email: 'meera@zen.example', role: 'client_admin' })
    expect((await data.access.issue({ profile_id: person.id, password: 'Zenyoga-01' })).login_code).toBe(client.client_code)
  })

  it('refuses weak passwords and staff profiles', async () => {
    await expect(data.access.issue({ profile_id: SEED_IDS.raackMember, password: 'short1' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(data.access.issue({ profile_id: SEED_IDS.raackMember, password: 'lettersonly' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(data.access.issue({ profile_id: SEED_IDS.pm, password: 'Strong-1234' })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('never shows passwords to a client, and stops a PM at clients that are not theirs', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    await expect(data.access.list()).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.access.issue({ profile_id: SEED_IDS.agkMember, password: 'Strong-1234' })).rejects.toMatchObject({ code: 'forbidden' })

    await signInAs(SEED_IDS.founder)
    const client = await data.clients.create({ name: 'Founder Only', slug: 'founder-only' })
    const person = await data.profiles.createClientUser({ client_id: client.id, full_name: 'X', email: 'x@founder.example', role: 'client_admin' })
    await signInAs(SEED_IDS.pm)
    await expect(data.access.issue({ profile_id: person.id, password: 'Strong-1234' })).rejects.toMatchObject({ code: 'forbidden' })
    expect((await data.access.list()).every((row) => row.client_id !== client.id)).toBe(true)
  })

  it('lets a client change their own password, and Vernex sees the new one', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    await expect(data.access.changeMyPassword({ current_password: 'Wrong-1234', new_password: 'Newpass-2026' })).rejects.toMatchObject({
      code: 'invalid',
    })
    await data.access.changeMyPassword({ current_password: SEED_PASSWORDS.agkAdmin, new_password: 'Newpass-2026' })

    await signInAs(SEED_IDS.founder)
    const credential = (await data.access.list()).find((row) => row.profile_id === SEED_IDS.agkAdmin)
    expect(credential).toMatchObject({ password: 'Newpass-2026', set_by: 'client' })
  })

  it('removes a login with its person or client', async () => {
    await data.profiles.remove(SEED_IDS.agkMember)
    expect(db.client_credentials.some((row) => row.profile_id === SEED_IDS.agkMember)).toBe(false)
    await data.clients.remove(raack)
    expect(db.client_credentials.some((row) => row.client_id === raack)).toBe(false)
  })
})

describe('client details', () => {
  it('lets a client save a draft, then refuses to submit until required fields are filled', async () => {
    await signInAs(SEED_IDS.raackAdmin)
    const saved = await data.clients.saveDetails({ client_id: raack, values: { legal_name: 'Raack Dance Academy LLP', city: 'Coimbatore' } })
    expect(saved.details).toMatchObject({ legal_name: 'Raack Dance Academy LLP' })
    expect(saved.details_submitted_at).toBeNull()
    // The answer also updates the client's own column.
    expect(saved.city).toBe('Coimbatore')
    await expect(data.clients.saveDetails({ client_id: raack, values: saved.details ?? {}, submit: true })).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('checks the format of answers', async () => {
    await signInAs(SEED_IDS.raackAdmin)
    await expect(data.clients.saveDetails({ client_id: raack, values: { contact_email: 'not-an-email' } })).rejects.toMatchObject({
      message: 'Enter a valid email address.',
    })
  })

  it('stops the client editing once Vernex locks the details; Vernex can still edit and unlock', async () => {
    await data.clients.setDetailsLocked(agk, true)
    await signInAs(SEED_IDS.agkAdmin)
    const locked = await data.clients.get(agk)
    expect(locked.details_locked_at).not.toBeNull()
    await expect(data.clients.saveDetails({ client_id: agk, values: { city: 'Madurai' } })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(data.clients.setDetailsLocked(agk, false)).rejects.toMatchObject({ code: 'forbidden' })

    await signInAs(SEED_IDS.pm)
    expect((await data.clients.saveDetails({ client_id: agk, values: { city: 'Madurai' } })).details?.city).toBe('Madurai')
    expect((await data.clients.setDetailsLocked(agk, false)).details_locked_at).toBeNull()
    await signInAs(SEED_IDS.agkAdmin)
    await expect(data.clients.saveDetails({ client_id: agk, values: { city: 'Salem' } })).resolves.toBeTruthy()
  })

  it('lets a client fill in only their own client', async () => {
    await signInAs(SEED_IDS.agkAdmin)
    await expect(data.clients.saveDetails({ client_id: raack, values: { city: 'X' } })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('changes the form for one client only, and keeps answers to removed fields', async () => {
    const fields = [
      { key: 'legal_name', label: 'Registered name', type: 'text' as const, required: true, section: 'Business', hint: null },
      { key: 'custom_shoot_days', label: 'Preferred shoot days', type: 'text' as const, required: false, section: 'Shoots', hint: null },
    ]
    const changed = await data.clients.setDetailFields(agk, fields)
    expect(changed.detail_fields).toHaveLength(2)
    expect((await data.clients.get(raack)).detail_fields).toBeNull()

    const saved = await data.clients.saveDetails({ client_id: agk, values: { legal_name: 'AGK Pvt Ltd', custom_shoot_days: 'Mon, Thu' } })
    expect(saved.details).toMatchObject({ legal_name: 'AGK Pvt Ltd', custom_shoot_days: 'Mon, Thu', city: 'Chennai' })

    await expect(data.clients.setDetailFields(agk, [{ ...fields[0]!, label: ' ' }])).rejects.toMatchObject({ code: 'invalid' })
    await expect(data.clients.setDetailFields(agk, [])).rejects.toMatchObject({ code: 'invalid' })
    expect((await data.clients.setDetailFields(agk, null)).detail_fields).toBeNull()

    await signInAs(SEED_IDS.agkAdmin)
    await expect(data.clients.setDetailFields(agk, fields)).rejects.toMatchObject({ code: 'forbidden' })
  })
})
