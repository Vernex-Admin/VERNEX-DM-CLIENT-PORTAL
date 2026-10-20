import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import { keys, R } from './keys'

/** Founder only: every client-to-staff assignment, account leads included. */
export function useAssignments() {
  return useQuery({ queryKey: keys.list(R.assignments), queryFn: () => data.profiles.listAssignments() })
}

function useRefreshStaff() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [R.staff, R.assignments, R.accountLead].map((key) => queryClient.invalidateQueries({ queryKey: keys.all(key) })),
    )
}

export function useCreateStaff() {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: (input: { email: string; full_name: string }) => data.profiles.createStaff(input),
    onSuccess: refresh,
  })
}

export function useSetStaffActive() {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => data.profiles.setActive(id, isActive),
    onSuccess: refresh,
  })
}

export function useAssignToClient() {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: ({ clientId, userId }: { clientId: string; userId: string }) =>
      data.profiles.assignToClient(clientId, userId),
    onSuccess: refresh,
  })
}

export function useUnassignFromClient() {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: ({ clientId, userId }: { clientId: string; userId: string }) =>
      data.profiles.unassignFromClient(clientId, userId),
    onSuccess: refresh,
  })
}
