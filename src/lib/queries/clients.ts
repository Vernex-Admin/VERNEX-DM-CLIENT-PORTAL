import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import type { MyProfilePatch } from '../../data'
import type { Client, ClientAssignment, ClientInsert, NotificationPrefs, Profile, ProfileInsert, Update } from '../../types/db'
import { keys, R } from './keys'
import { nowIso, tempId, useOptimisticMutation } from './optimistic'

const DEFAULT_PREFS: NotificationPrefs = {
  email: true,
  whatsapp: true,
  approvals: true,
  comments: true,
  invoices: true,
  weekly_report: false,
}

export function useClients() {
  return useQuery({ queryKey: keys.list(R.clients), queryFn: () => data.clients.list() })
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(R.clients, id),
    queryFn: () => data.clients.get(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateClient() {
  return useOptimisticMutation<Client, ClientInsert>({
    resource: R.clients,
    mutationFn: (input) => data.clients.create(input),
    change: (input) => ({
      type: 'create',
      row: {
        logo_url: null,
        industry: null,
        city: null,
        gstin: null,
        billing_email: null,
        currency: 'INR',
        retainer_minor: null,
        retainer_months: null,
        ...input,
        id: tempId(),
        created_at: nowIso(),
      },
    }),
  })
}

export function useUpdateClient() {
  return useOptimisticMutation<Client, { id: string; patch: Update<Client> }>({
    resource: R.clients,
    mutationFn: ({ id, patch }) => data.clients.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}

/** Deletes the client and everything that belongs to it. */
export function useDeleteClient() {
  return useOptimisticMutation<Client, string, void>({
    resource: R.clients,
    mutationFn: (id) => data.clients.remove(id),
    change: (id) => ({ type: 'remove', id }),
    invalidate: [R.clientUsers, R.projects, R.deliverables, R.invoices, R.actionItems],
  })
}

// --- Client users -----------------------------------------------------------

export function useClientUsers(clientId: string | undefined) {
  return useQuery({
    queryKey: keys.list(R.clientUsers, { client_id: clientId }),
    queryFn: () => data.profiles.listByClient(clientId as string),
    enabled: Boolean(clientId),
  })
}

/** The client's Vernex account lead, for the dashboard contact card. */
export function useAccountLead(clientId: string | undefined) {
  return useQuery({
    queryKey: keys.detail(R.accountLead, clientId),
    queryFn: () => data.profiles.getAccountLead(clientId as string),
    enabled: Boolean(clientId),
  })
}

/** Staff only: the Vernex people an account lead can be chosen from. */
export function useStaff() {
  return useQuery({ queryKey: keys.list(R.staff), queryFn: () => data.profiles.listStaff() })
}

/** Staff only: the account lead of every visible client. */
export function useAccountLeads() {
  return useQuery({ queryKey: keys.list(R.accountLead), queryFn: () => data.profiles.listAccountLeads() })
}

export function useSetAccountLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, userId }: { clientId: string; userId: string }) =>
      data.profiles.setAccountLead(clientId, userId),
    onMutate: async ({ clientId, userId }) => {
      const key = keys.list(R.accountLead)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ClientAssignment[]>(key)
      queryClient.setQueryData<ClientAssignment[]>(key, (rows = []) => [
        ...rows.filter((row) => row.client_id !== clientId),
        { client_id: clientId, user_id: userId, is_account_lead: true },
      ])
      return { key, previous }
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all(R.accountLead) }),
  })
}

export function useCreateClientUser() {
  return useOptimisticMutation<Profile, ProfileInsert & { client_id: string }>({
    resource: R.clientUsers,
    mutationFn: (input) => data.profiles.createClientUser(input),
    change: (input) => ({
      type: 'create',
      row: {
        phone_e164: null,
        avatar_url: null,
        can_approve: input.role === 'client_admin',
        is_active: true,
        ...input,
        notification_prefs: input.notification_prefs ?? DEFAULT_PREFS,
        id: tempId(),
        created_at: nowIso(),
      },
    }),
  })
}

export function useUpdateClientUser() {
  return useOptimisticMutation<Profile, { id: string; patch: Update<Profile> }>({
    resource: R.clientUsers,
    mutationFn: ({ id, patch }) => data.profiles.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
    // Editing your own profile, e.g. can_approve, changes what useCan() answers.
    invalidate: [R.session],
  })
}

/** The signed-in user edits their own name, WhatsApp number and notification choices. */
export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: MyProfilePatch) => data.profiles.updateMe(patch),
    onSettled: () =>
      Promise.all([R.session, R.clientUsers, R.accountLead].map((key) => queryClient.invalidateQueries({ queryKey: keys.all(key) }))),
  })
}

export function useDeleteClientUser() {
  return useOptimisticMutation<Profile, string, void>({
    resource: R.clientUsers,
    mutationFn: (id) => data.profiles.remove(id),
    change: (id) => ({ type: 'remove', id }),
  })
}
