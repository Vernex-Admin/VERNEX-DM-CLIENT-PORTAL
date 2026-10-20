import type { Project } from '../../types/db'
import { DataError } from '../types'
import type { ProjectsRepo } from '../types'
import { supabase } from './client'
import { cleanPatch, deleted, row, rows } from './errors'

const PROJECT_NOT_FOUND = { PGRST116: "We couldn't find that project." }

export const projects: ProjectsRepo = {
  list(filter = {}) {
    let query = supabase().from('projects').select('*').order('created_at', { ascending: true })
    if (filter.client_id) query = query.eq('client_id', filter.client_id)
    return rows<Project>(query)
  },

  get: (id) => row<Project>(supabase().from('projects').select('*').eq('id', id).single(), PROJECT_NOT_FOUND),

  create: (input) => row<Project>(supabase().from('projects').insert(input).select().single()),

  update: (id, patch) =>
    row<Project>(
      supabase().from('projects').update(cleanPatch(patch)).eq('id', id).select().single(),
      PROJECT_NOT_FOUND,
    ),

  remove: (id) =>
    deleted(
      supabase().from('projects').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that project."),
    ),
}
