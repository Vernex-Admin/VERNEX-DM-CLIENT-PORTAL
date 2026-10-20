import type { Comment, CommentTarget } from '../../types/db'
import { DataError } from '../types'
import type { CommentsRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { maybeRow, row, rows } from './errors'

const TARGET_TABLE: Record<CommentTarget, string> = {
  deliverable: 'deliverables',
  file: 'files',
  project: 'projects',
  service_request: 'service_requests',
}

export const comments: CommentsRepo = {
  // Internal comments are hidden from clients by row-level security.
  list: (filter) =>
    rows<Comment>(
      supabase()
        .from('comments')
        .select('*')
        .eq('target_type', filter.target_type)
        .eq('target_id', filter.target_id)
        .order('created_at', { ascending: true }),
    ),

  async create(input) {
    const table = TARGET_TABLE[input.target_type]
    const columns = input.target_type === 'project' ? 'id, client_id' : 'id, client_id, project_id'
    const target = await maybeRow<{ id: string; client_id: string; project_id?: string | null }>(
      supabase().from(table).select(columns).eq('id', input.target_id).maybeSingle(),
    )
    if (!target) throw new DataError('not_found', `We couldn't find that ${input.target_type.replace('_', ' ')}.`)
    const author = await requireProfile()
    return row<Comment>(
      supabase()
        .from('comments')
        .insert({
          client_id: target.client_id,
          project_id: input.target_type === 'project' ? target.id : (target.project_id ?? null),
          target_type: input.target_type,
          target_id: input.target_id,
          author_id: author.id,
          body: input.body,
          visibility: input.visibility ?? 'client',
        })
        .select()
        .single(),
      { '42501': "You can't post that comment." },
    )
  },
}
