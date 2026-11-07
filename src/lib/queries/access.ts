import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data, DataError } from '../../data'
import type { ClientDetailsSave, IssueLogin } from '../../data'
import type { Client, ClientCredential, ClientDetailField, ClientInsert } from '../../types/db'
import { loginOnlyEmail } from '../credentials'
import { keys, R } from './keys'

// Client Codes, logins and the client details form.

/** Staff only: every visible client user's login code and current password. */
export function useClientCredentials(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.list(R.credentials),
    queryFn: () => data.access.list(),
    enabled: options.enabled ?? true,
  })
}

/** Staff: set up a person's login, or give them a new password. */
export function useIssueLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: IssueLogin) => data.access.issue(input),
    onSettled: () =>
      Promise.all([R.credentials, R.clientUsers].map((key) => queryClient.invalidateQueries({ queryKey: keys.all(key) }))),
  })
}

/** A client user changes their own password. */
export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) => data.access.changeMyPassword(input),
  })
}

export type NewClientWithLogin = {
  client: ClientInsert
  /** The person who signs in with the Client Code. */
  contact: { full_name: string; email: string | null }
  password: string
}

export type CreatedClient = {
  client: Client
  credential: ClientCredential | null
  /** Set when the client was created but its login could not be set up; retry from Client Management. */
  loginError: string | null
}

/**
 * Creates the client (the database assigns its Client Code), its first person as client admin, and
 * that person's login with the given password.
 */
export function useCreateClientWithLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ client: input, contact, password }: NewClientWithLogin): Promise<CreatedClient> => {
      const client = await data.clients.create(input)
      // No code back means the database is missing the Client Management migration.
      if (!client.client_code) {
        return {
          client,
          credential: null,
          loginError:
            'The database has no Client Codes yet. A Vernex admin must apply the latest Supabase migration (client_management), then set up the login from the Login tab.',
        }
      }
      try {
        const person = await data.profiles.createClientUser({
          client_id: client.id,
          full_name: contact.full_name,
          email: contact.email || loginOnlyEmail(client.client_code),
          role: 'client_admin',
          can_approve: true,
        })
        const credential = await data.access.issue({ profile_id: person.id, password })
        return { client, credential, loginError: null }
      } catch (error) {
        const message = error instanceof DataError ? error.message : 'The login could not be set up.'
        return { client, credential: null, loginError: message }
      }
    },
    onSettled: () =>
      Promise.all(
        [R.clients, R.clientUsers, R.credentials, R.accountLead].map((key) =>
          queryClient.invalidateQueries({ queryKey: keys.all(key) }),
        ),
      ),
  })
}

function useClientWrite<TVars>(mutationFn: (vars: TVars) => Promise<Client>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (client) => queryClient.setQueryData(keys.detail(R.clients, client.id), client),
    onSettled: () =>
      Promise.all([R.clients, R.invoices].map((key) => queryClient.invalidateQueries({ queryKey: keys.all(key) }))),
  })
}

/** A client saves (or submits) their details; staff save any client's. */
export function useSaveClientDetails() {
  return useClientWrite((input: ClientDetailsSave) => data.clients.saveDetails(input))
}

/** Staff: the questions on one client's details form. Null restores the standard fields. */
export function useSetDetailFields() {
  return useClientWrite(({ clientId, fields }: { clientId: string; fields: ClientDetailField[] | null }) =>
    data.clients.setDetailFields(clientId, fields),
  )
}

/** Staff: lock or unlock a client's details. */
export function useSetDetailsLocked() {
  return useClientWrite(({ clientId, locked }: { clientId: string; locked: boolean }) =>
    data.clients.setDetailsLocked(clientId, locked),
  )
}
