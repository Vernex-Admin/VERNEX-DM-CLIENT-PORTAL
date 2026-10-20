import type { FileRecord } from '../../types/db'
import { DataError } from '../types'
import type { FilesRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { deleted, maybeRow, row, rows, webLink } from './errors'
import { discardUpload, uploadToVault, withSignedUrls } from './storage'

export const files: FilesRepo = {
  async list(filter) {
    let query = supabase()
      .from('files')
      .select('*')
      .eq('client_id', filter.client_id)
      .order('created_at', { ascending: true })
    if (filter.folder) query = query.eq('folder', filter.folder)
    return withSignedUrls(await rows<FileRecord>(query))
  },

  async uploadBrandAsset(input) {
    const { file } = input
    if (!file) throw new DataError('invalid', 'Choose a file to upload.')
    const uploader = await requireProfile()
    const path = await uploadToVault(input.client_id, 'brand_assets', file)
    try {
      const created = await row<FileRecord>(
        supabase()
          .from('files')
          .insert({
            client_id: input.client_id,
            folder: 'brand_assets',
            name: file.name,
            mime_type: file.type || input.mime_type || null,
            size_bytes: file.size,
            storage_key: path,
            uploaded_by: uploader.id,
            visibility: 'client',
          })
          .select()
          .single(),
        { '42501': "You can't upload to this client." },
      )
      return (await withSignedUrls([created]))[0] as FileRecord
    } catch (error) {
      // The row could not be saved, so the upload would be unreachable: take it back out.
      await discardUpload(path)
      throw error
    }
  },

  async addLink(input) {
    const link = webLink(input.external_url)
    if (!link) throw new DataError('invalid', 'Paste a link that starts with https://')
    const uploader = await requireProfile()
    return row<FileRecord>(
      supabase()
        .from('files')
        .insert({
          client_id: input.client_id,
          folder: input.folder,
          name: input.name,
          external_url: link,
          storage_key: '',
          uploaded_by: uploader.id,
          visibility: input.visibility ?? 'client',
        })
        .select()
        .single(),
      { '42501': "You can't add a link for this client." },
    )
  },

  async remove(id) {
    const existing = await maybeRow<{ storage_key: string }>(
      supabase().from('files').select('storage_key').eq('id', id).maybeSingle(),
    )
    if (!existing) throw new DataError('not_found', "We couldn't find that file.")
    // The row first (it decides who may touch the object), then the object itself.
    await deleted(
      supabase().from('files').delete().eq('id', id).select('id'),
      new DataError('forbidden', "You can't remove that file."),
    )
    await discardUpload(existing.storage_key)
  },
}
