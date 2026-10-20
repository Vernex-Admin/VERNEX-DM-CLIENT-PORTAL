import type { Deliverable, DeliverableVersion, FileRecord } from '../../types/db'
import { DataError } from '../types'
import type { DeliverablesRepo } from '../types'
import { supabase } from './client'
import { requireProfile } from './auth'
import { cleanPatch, deleted, maybeRow, row, rows, toDataError, webLink } from './errors'
import { discardUpload, signedUrls, uploadToVault } from './storage'

// An uploaded version is saved as `vault:<path>` and signed when it is shown, so it never expires in the database.
const VAULT_PREFIX = 'vault:'

const NOT_FOUND = { PGRST116: "We couldn't find that deliverable." }

export const deliverables: DeliverablesRepo = {
  list(filter = {}) {
    let query = supabase().from('deliverables').select('*').order('created_at', { ascending: true })
    if (filter.client_id) query = query.eq('client_id', filter.client_id)
    if (filter.project_id) query = query.eq('project_id', filter.project_id)
    if (filter.status) query = query.eq('status', filter.status)
    return rows<Deliverable>(query)
  },

  get: (id) => row<Deliverable>(supabase().from('deliverables').select('*').eq('id', id).single(), NOT_FOUND),

  async listVersions(id) {
    const versions = await rows<DeliverableVersion>(
      supabase()
        .from('deliverable_versions')
        .select('*')
        .eq('deliverable_id', id)
        .order('version', { ascending: true }),
    )
    const urls = await signedUrls(
      versions.filter((v) => v.preview_url.startsWith(VAULT_PREFIX)).map((v) => v.preview_url.slice(VAULT_PREFIX.length)),
    )
    return versions.map((v) =>
      v.preview_url.startsWith(VAULT_PREFIX)
        ? { ...v, preview_url: urls.get(v.preview_url.slice(VAULT_PREFIX.length)) ?? v.preview_url }
        : v,
    )
  },

  async create(input) {
    const project = await maybeRow<{ client_id: string; default_revision_limit: number }>(
      supabase().from('projects').select('client_id, default_revision_limit').eq('id', input.project_id).maybeSingle(),
    )
    if (!project) throw new DataError('not_found', "We couldn't find that project.")
    return row<Deliverable>(
      supabase()
        .from('deliverables')
        .insert({
          ...input,
          client_id: project.client_id,
          revision_limit: input.revision_limit ?? project.default_revision_limit,
        })
        .select()
        .single(),
    )
  },

  update: (id, patch) =>
    row<Deliverable>(
      supabase().from('deliverables').update(cleanPatch(patch)).eq('id', id).select().single(),
      NOT_FOUND,
    ),

  remove: (id) =>
    deleted(
      supabase().from('deliverables').delete().eq('id', id).select('id'),
      new DataError('not_found', "We couldn't find that deliverable."),
    ),

  async publishVersion(id, input) {
    // A linked version must be a web address (a Drive share link); an upload becomes `vault:<path>` below.
    let previewUrl = input.file ? input.preview_url : (webLink(input.preview_url) ?? '')
    let uploaded: { path: string; fileId: string } | null = null

    if (input.file) {
      const deliverable = await maybeRow<Deliverable>(
        supabase().from('deliverables').select('*').eq('id', id).maybeSingle(),
      )
      if (!deliverable) throw new DataError('not_found', "We couldn't find that deliverable.")
      const uploader = await requireProfile()
      const folder = input.file.type === 'application/pdf' ? 'documents' : 'rendered_ads'
      const path = await uploadToVault(deliverable.client_id, folder, input.file)
      try {
        const file = await row<FileRecord>(
          supabase()
            .from('files')
            .insert({
              client_id: deliverable.client_id,
              project_id: deliverable.project_id,
              deliverable_id: deliverable.id,
              folder,
              name: input.file.name,
              mime_type: input.file.type || null,
              size_bytes: input.file.size,
              storage_key: path,
              uploaded_by: uploader.id,
              visibility: input.visibility ?? deliverable.visibility,
            })
            .select()
            .single(),
        )
        uploaded = { path, fileId: file.id }
      } catch (error) {
        await discardUpload(path)
        throw error
      }
      previewUrl = `${VAULT_PREFIX}${path}`
    }

    const { data, error } = await supabase().rpc('publish_version', {
      p_deliverable_id: id,
      p_preview_kind: input.preview_kind,
      p_preview_url: previewUrl,
      p_visibility: input.visibility ?? null,
    })
    if (error) {
      if (uploaded) {
        await supabase().from('files').delete().eq('id', uploaded.fileId)
        await discardUpload(uploaded.path)
      }
      throw toDataError(error)
    }
    return data as Deliverable
  },

  async approve(id) {
    const { data, error } = await supabase().rpc('approve_deliverable', { p_deliverable_id: id })
    if (error) throw toDataError(error)
    return data as Deliverable
  },
}
