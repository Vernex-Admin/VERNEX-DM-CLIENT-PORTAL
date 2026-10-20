import type { Milestone } from '../../types/db'
import { DataError } from '../types'
import type { MilestonesRepo } from '../types'
import { supabase } from './client'
import { cleanPatch, deleted, maybeRow, row, rows, toDataError } from './errors'

const MILESTONE_NOT_FOUND = { PGRST116: "We couldn't find that milestone." }

export const milestones: MilestonesRepo = {
  list: (filter) =>
    rows<Milestone>(
      supabase().from('milestones').select('*').eq('project_id', filter.project_id).order('position', { ascending: true }),
    ),

  async create(input) {
    const project = await maybeRow<{ client_id: string }>(
      supabase().from('projects').select('client_id').eq('id', input.project_id).maybeSingle(),
    )
    if (!project) throw new DataError('not_found', "We couldn't find that project.")
    const last = await maybeRow<{ position: number }>(
      supabase()
        .from('milestones')
        .select('position')
        .eq('project_id', input.project_id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    return row<Milestone>(
      supabase()
        .from('milestones')
        .insert({ position: (last?.position ?? 0) + 1, ...input, client_id: project.client_id })
        .select()
        .single(),
    )
  },

  update: (id, patch) =>
    row<Milestone>(
      supabase().from('milestones').update(cleanPatch(patch)).eq('id', id).select().single(),
      MILESTONE_NOT_FOUND,
    ),

  remove: (id) =>
    deleted(
      supabase().from('milestones').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that milestone."),
    ),

  async reorder(projectId, orderedIds) {
    const { data, error } = await supabase().rpc('reorder_milestones', {
      p_project_id: projectId,
      p_ordered_ids: orderedIds,
    })
    if (error) throw toDataError(error)
    return (data ?? []) as Milestone[]
  },
}
