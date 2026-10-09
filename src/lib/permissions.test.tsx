// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { createSeed, SEED_IDS } from '../data/mock/seed'
import type { Profile } from '../types/db'
import { can, useCan } from './permissions'
import type { Action, Resource } from './permissions'
import { SessionContext } from './session-context'

const seed = createSeed().profiles
const byId = (id: string): Profile => {
  const profile = seed.find((row) => row.id === id)
  if (!profile) throw new Error(`No seeded profile ${id}`)
  return profile
}

const founder = byId(SEED_IDS.founder)
const pm = byId(SEED_IDS.pm)
const agkAdmin = byId(SEED_IDS.agkAdmin)
const agkMember = byId(SEED_IDS.agkMember) // can_approve = false
const raackMember = byId(SEED_IDS.raackMember) // can_approve = true

const adminRoles = [
  ['vernex_founder', founder],
  ['vernex_pm', pm],
] as const
const clientRoles = [
  ['client_admin', agkAdmin],
  ['client_member', agkMember],
] as const

const adminManaged: Resource[] = ['client', 'client_user', 'project', 'milestone', 'deliverable', 'invoice']
const writes: Action[] = ['create', 'edit', 'delete']

describe('admin roles', () => {
  describe.each(adminRoles)('%s', (_role, profile) => {
    it.each(adminManaged)('views, creates, edits and deletes %s', (resource) => {
      for (const action of ['view', ...writes] as Action[]) {
        expect(can(profile, resource, action), `${resource}:${action}`).toBe(true)
      }
    })

    it('sees internal comments and leads', () => {
      expect(can(profile, 'internal_comment', 'view')).toBe(true)
      expect(can(profile, 'lead', 'view')).toBe(true)
    })

    it('does not approve or request revisions on a client’s behalf', () => {
      expect(can(profile, 'deliverable', 'approve')).toBe(false)
      expect(can(profile, 'deliverable', 'request_revision')).toBe(false)
    })
  })

  it('lets only the founder read the Founder Box inbox', () => {
    expect(can(founder, 'founder_inbox', 'view')).toBe(true)
    expect(can(pm, 'founder_inbox', 'view')).toBe(false)
  })
})

describe('client roles', () => {
  describe.each(clientRoles)('%s', (_role, profile) => {
    const own = { clientId: profile.client_id ?? undefined }
    const other = { clientId: SEED_IDS.raack }

    it.each(adminManaged)('views %s of their own client', (resource) => {
      expect(can(profile, resource, 'view', own)).toBe(true)
    })

    it.each(adminManaged)('cannot create, edit or delete %s', (resource) => {
      for (const action of writes) {
        expect(can(profile, resource, action, own), `${resource}:${action}`).toBe(false)
        expect(can(profile, resource, action), `${resource}:${action} without a client`).toBe(false)
      }
    })

    it.each(adminManaged)('cannot view %s of another client', (resource) => {
      expect(can(profile, resource, 'view', other)).toBe(false)
    })

    it('never sees internal comments, leads or the Founder Box inbox', () => {
      expect(can(profile, 'internal_comment', 'view', own)).toBe(false)
      expect(can(profile, 'internal_comment', 'create', own)).toBe(false)
      expect(can(profile, 'lead', 'view')).toBe(false)
      expect(can(profile, 'founder_inbox', 'view')).toBe(false)
    })

    it('can submit service requests, upload brand assets, comment and write to the founder', () => {
      expect(can(profile, 'service_request', 'create', own)).toBe(true)
      expect(can(profile, 'brand_asset', 'upload', own)).toBe(true)
      expect(can(profile, 'comment', 'create', own)).toBe(true)
      expect(can(profile, 'founder_box', 'create', own)).toBe(true)
    })

    it('cannot do those four things for another client', () => {
      expect(can(profile, 'service_request', 'create', other)).toBe(false)
      expect(can(profile, 'brand_asset', 'upload', other)).toBe(false)
      expect(can(profile, 'comment', 'create', other)).toBe(false)
    })
  })

  it('lets a client_admin approve and request revisions on their own client', () => {
    const own = { clientId: SEED_IDS.agk }
    expect(can(agkAdmin, 'deliverable', 'approve', own)).toBe(true)
    expect(can(agkAdmin, 'deliverable', 'request_revision', own)).toBe(true)
    expect(can(agkAdmin, 'deliverable', 'approve', { clientId: SEED_IDS.raack })).toBe(false)
  })

  it('refuses a client_member without can_approve', () => {
    expect(agkMember.can_approve).toBe(false)
    const own = { clientId: SEED_IDS.agk }
    expect(can(agkMember, 'deliverable', 'approve', own)).toBe(false)
    expect(can(agkMember, 'deliverable', 'request_revision', own)).toBe(false)
    expect(can(agkMember, 'deliverable', 'approve')).toBe(false)
  })

  it('lets a client_member with can_approve approve and request revisions', () => {
    expect(raackMember.can_approve).toBe(true)
    const own = { clientId: SEED_IDS.raack }
    expect(can(raackMember, 'deliverable', 'approve', own)).toBe(true)
    expect(can(raackMember, 'deliverable', 'request_revision', own)).toBe(true)
    expect(can(raackMember, 'deliverable', 'approve', { clientId: SEED_IDS.agk })).toBe(false)
  })

  it('ignores can_approve on the other resources', () => {
    const switchedOn: Profile = { ...agkMember, can_approve: true }
    expect(can(switchedOn, 'project', 'create', { clientId: SEED_IDS.agk })).toBe(false)
    expect(can(switchedOn, 'invoice', 'edit', { clientId: SEED_IDS.agk })).toBe(false)
  })
})

describe('signed out and inactive users', () => {
  it('are refused everything', () => {
    const inactive: Profile = { ...founder, is_active: false }
    for (const profile of [null, undefined, inactive]) {
      expect(can(profile, 'client', 'view')).toBe(false)
      expect(can(profile, 'project', 'create')).toBe(false)
    }
  })
})

describe('useCan', () => {
  const asUser = (profile: Profile | null) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <SessionContext value={profile}>{children}</SessionContext>
    }

  it('answers for the signed-in profile', () => {
    const { result } = renderHook(() => useCan('project', 'create'), { wrapper: asUser(pm) })
    expect(result.current).toBe(true)
  })

  it('refuses a client for admin actions', () => {
    const { result } = renderHook(() => useCan('project', 'create'), { wrapper: asUser(agkAdmin) })
    expect(result.current).toBe(false)
  })

  it('applies the can_approve rule', () => {
    const own = { clientId: SEED_IDS.agk }
    const refused = renderHook(() => useCan('deliverable', 'approve', own), { wrapper: asUser(agkMember) })
    expect(refused.result.current).toBe(false)
    const allowed = renderHook(() => useCan('deliverable', 'approve', own), {
      wrapper: asUser({ ...agkMember, can_approve: true }),
    })
    expect(allowed.result.current).toBe(true)
  })

  it('is false while the session is loading or signed out', () => {
    const { result } = renderHook(() => useCan('client', 'view'), { wrapper: asUser(null) })
    expect(result.current).toBe(false)
  })
})
