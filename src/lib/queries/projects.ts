import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import type { ClientFilter } from '../../data'
import type { Milestone, MilestoneInsert, Project, ProjectInsert, Update } from '../../types/db'
import { keys, R } from './keys'
import { nowIso, tempId, useOptimisticMutation } from './optimistic'

export function useProjects(filter: ClientFilter = {}) {
  return useQuery({ queryKey: keys.list(R.projects, filter), queryFn: () => data.projects.list(filter) })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(R.projects, id),
    queryFn: () => data.projects.get(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateProject() {
  return useOptimisticMutation<Project, ProjectInsert>({
    resource: R.projects,
    mutationFn: (input) => data.projects.create(input),
    change: (input) => ({
      type: 'create',
      row: {
        description: null,
        health: 'on_track',
        health_reason: null,
        start_date: null,
        target_end_date: null,
        default_revision_limit: 3,
        ...input,
        id: tempId(),
        created_at: nowIso(),
      },
    }),
  })
}

export function useUpdateProject() {
  return useOptimisticMutation<Project, { id: string; patch: Update<Project> }>({
    resource: R.projects,
    mutationFn: ({ id, patch }) => data.projects.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}

/** Deletes the project with its milestones, deliverables and revisions. */
export function useDeleteProject() {
  return useOptimisticMutation<Project, string, void>({
    resource: R.projects,
    mutationFn: (id) => data.projects.remove(id),
    change: (id) => ({ type: 'remove', id }),
    invalidate: [R.milestones, R.deliverables, R.revisions, R.actionItems],
  })
}

// --- Milestones -------------------------------------------------------------

export function useMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.list(R.milestones, { project_id: projectId }),
    queryFn: () => data.milestones.list({ project_id: projectId as string }),
    enabled: Boolean(projectId),
  })
}

export function useCreateMilestone() {
  return useOptimisticMutation<Milestone, MilestoneInsert>({
    resource: R.milestones,
    mutationFn: (input) => data.milestones.create(input),
    change: (input) => ({
      type: 'create',
      row: {
        client_id: '',
        // Sorts last until the server assigns the real position.
        position: Number.MAX_SAFE_INTEGER,
        due_date: null,
        status: 'upcoming',
        completed_at: null,
        invoice_trigger: false,
        ...input,
        id: tempId(),
      },
    }),
  })
}

export function useUpdateMilestone() {
  return useOptimisticMutation<Milestone, { id: string; patch: Update<Milestone> }>({
    resource: R.milestones,
    mutationFn: ({ id, patch }) => data.milestones.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}

/** Moves milestones into `orderedIds` straight away and restores the old order if the write fails. */
export function useReorderMilestones() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, orderedIds }: { projectId: string; orderedIds: string[] }) =>
      data.milestones.reorder(projectId, orderedIds),
    onMutate: async ({ projectId, orderedIds }) => {
      const key = keys.list(R.milestones, { project_id: projectId })
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Milestone[]>(key)
      queryClient.setQueryData<Milestone[]>(key, (rows) =>
        rows
          ?.map((row) => ({ ...row, position: orderedIds.indexOf(row.id) + 1 }))
          .sort((a, b) => a.position - b.position),
      )
      return { key, previous }
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all(R.milestones) }),
  })
}

export function useDeleteMilestone() {
  return useOptimisticMutation<Milestone, string, void>({
    resource: R.milestones,
    mutationFn: (id) => data.milestones.remove(id),
    change: (id) => ({ type: 'remove', id }),
    invalidate: [R.deliverables],
  })
}
