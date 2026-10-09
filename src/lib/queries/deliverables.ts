import { useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import type { DeliverableFilter, RevisionRequest } from '../../data'
import type { Deliverable, DeliverableInsert, Profile, Revision, Update } from '../../types/db'
import { keys, R } from './keys'
import { nowIso, tempId, useOptimisticMutation } from './optimistic'

export function useDeliverables(filter: DeliverableFilter = {}) {
  return useQuery({ queryKey: keys.list(R.deliverables, filter), queryFn: () => data.deliverables.list(filter) })
}

export function useDeliverable(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(R.deliverables, id),
    queryFn: () => data.deliverables.get(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateDeliverable() {
  return useOptimisticMutation<Deliverable, DeliverableInsert>({
    resource: R.deliverables,
    mutationFn: (input) => data.deliverables.create(input),
    change: (input) => ({
      type: 'create',
      row: {
        milestone_id: null,
        status: 'draft',
        revision_limit: 3,
        due_date: null,
        platform: null,
        caption: null,
        ...input,
        id: tempId(),
        client_id: '',
        current_version: 1,
        revisions_used: 0,
        approved_by: null,
        approved_at: null,
        approved_via: null,
        created_at: nowIso(),
      },
    }),
    // The optimistic row has no client yet, so only project and status filters decide membership.
    belongs: (row, filter) =>
      (filter.project_id === undefined || row.project_id === filter.project_id) &&
      (filter.status === undefined || row.status === filter.status) &&
      (filter.client_id === undefined || row.client_id === '' || row.client_id === filter.client_id),
  })
}

export function useUpdateDeliverable() {
  return useOptimisticMutation<Deliverable, { id: string; patch: Update<Deliverable> }>({
    resource: R.deliverables,
    mutationFn: ({ id, patch }) => data.deliverables.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}

export function useDeleteDeliverable() {
  return useOptimisticMutation<Deliverable, string, void>({
    resource: R.deliverables,
    mutationFn: (id) => data.deliverables.remove(id),
    change: (id) => ({ type: 'remove', id }),
    invalidate: [R.revisions, R.actionItems],
  })
}

/** Client approval. The deliverable shows as approved at once and rolls back if the write fails. */
export function useApproveDeliverable() {
  const queryClient = useQueryClient()
  return useOptimisticMutation<Deliverable, string>({
    resource: R.deliverables,
    mutationFn: (id) => data.deliverables.approve(id),
    change: (id) => ({
      type: 'patch',
      id,
      patch: {
        status: 'approved',
        approved_at: nowIso(),
        approved_via: 'portal',
        approved_by: queryClient.getQueryData<Profile | null>(keys.detail(R.session, 'current'))?.id ?? null,
      },
    }),
    // Approving closes the matching "Action Required" item.
    invalidate: [R.actionItems],
  })
}

// --- Revisions --------------------------------------------------------------

export function useRevisions(deliverableId: string | undefined) {
  return useQuery({
    queryKey: keys.list(R.revisions, { deliverable_id: deliverableId }),
    queryFn: () => data.revisions.list({ deliverable_id: deliverableId as string }),
    enabled: Boolean(deliverableId),
  })
}

/** Client asks for changes. Uses one revision and moves the deliverable to revision_requested. */
export function useRequestRevision() {
  const queryClient = useQueryClient()
  return useOptimisticMutation<Revision, RevisionRequest>({
    resource: R.revisions,
    mutationFn: (input) => data.revisions.request(input),
    change: (input) => {
      const existing = queryClient.getQueryData<Revision[]>(
        keys.list(R.revisions, { deliverable_id: input.deliverable_id }),
      )
      return {
        type: 'create',
        row: {
          id: tempId(),
          deliverable_id: input.deliverable_id,
          client_id: '',
          revision_number: (existing?.length ?? 0) + 1,
          on_version: 1,
          description: input.description,
          priority: input.priority ?? 'normal',
          status: 'submitted',
          counts_against_limit: true,
          requested_by: queryClient.getQueryData<Profile | null>(keys.detail(R.session, 'current'))?.id ?? '',
          submitted_at: nowIso(),
          delivered_at: null,
        },
      }
    },
    invalidate: [R.deliverables, R.actionItems],
  })
}

/** Staff move a revision through accepted, in_progress and delivered. */
export function useUpdateRevision() {
  return useOptimisticMutation<Revision, { id: string; patch: Update<Revision> }>({
    resource: R.revisions,
    mutationFn: ({ id, patch }) => data.revisions.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}
