import type { ClientDocument, FileRecord } from '../../types/db'
import { DataError } from '../types'
import type { DocumentsRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { cleanPatch, deleted, maybeRow, row, rows, webLink } from './errors'
import { discardUpload, signedUrls, uploadToVault } from './storage'

const NOT_FOUND = { PGRST116: "We couldn't find that document." }

/** An uploaded document shows through a fresh signed link; nothing signed is ever stored. */
async function withFileLinks(docs: ClientDocument[]): Promise<ClientDocument[]> {
  const ids = docs.flatMap((doc) => (doc.file_id && !doc.external_url ? [doc.file_id] : []))
  if (ids.length === 0) return docs
  const found = await rows<Pick<FileRecord, 'id' | 'storage_key'>>(
    supabase().from('files').select('id, storage_key').in('id', ids),
  )
  const urls = await signedUrls(found.map((file) => file.storage_key))
  return docs.map((doc) => {
    const key = found.find((file) => file.id === doc.file_id)?.storage_key
    return key && urls.has(key) && !doc.external_url ? { ...doc, external_url: urls.get(key) as string } : doc
  })
}

/** A draft's file stays internal; once it is sent the client may open it. */
const fileVisibility = (status: ClientDocument['status']) => (status === 'draft' ? 'internal' : 'client')

export const documents: DocumentsRepo = {
  async list(clientId) {
    const docs = await rows<ClientDocument>(
      supabase().from('documents').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    )
    return withFileLinks(docs)
  },

  async create(input) {
    if (!input.title?.trim()) throw new DataError('invalid', 'A document needs a title.')
    const status = input.status ?? 'draft'
    const now = new Date().toISOString()
    let fileId = input.file_id ?? null
    let uploadedPath: string | null = null

    if (input.file) {
      const uploader = await requireProfile()
      uploadedPath = await uploadToVault(input.client_id, 'documents', input.file)
      try {
        const file = await row<FileRecord>(
          supabase()
            .from('files')
            .insert({
              client_id: input.client_id,
              folder: 'documents',
              name: input.file.name,
              mime_type: input.file.type || null,
              size_bytes: input.file.size,
              storage_key: uploadedPath,
              uploaded_by: uploader.id,
              visibility: fileVisibility(status),
            })
            .select()
            .single(),
        )
        fileId = file.id
      } catch (error) {
        await discardUpload(uploadedPath)
        throw error
      }
    }

    try {
      const doc = await row<ClientDocument>(
        supabase()
          .from('documents')
          .insert({
            client_id: input.client_id,
            kind: input.kind,
            title: input.title.trim(),
            file_id: fileId,
            external_url: webLink(input.external_url),
            status,
            sent_at: status === 'sent' || status === 'signed' ? (input.sent_at ?? now) : null,
            signed_at: status === 'signed' ? (input.signed_at ?? now) : null,
          })
          .select()
          .single(),
      )
      return (await withFileLinks([doc]))[0] as ClientDocument
    } catch (error) {
      if (fileId && uploadedPath) {
        await supabase().from('files').delete().eq('id', fileId)
        await discardUpload(uploadedPath)
      }
      throw error
    }
  },

  async update(id, patch) {
    const doc = await maybeRow<ClientDocument>(supabase().from('documents').select('*').eq('id', id).maybeSingle())
    if (!doc) throw new DataError('not_found', "We couldn't find that document.")
    const changes: Record<string, unknown> = cleanPatch(patch, ['sent_at', 'signed_at', 'status', 'external_url'])
    if (patch.external_url !== undefined) changes.external_url = webLink(patch.external_url)
    if (typeof changes.title === 'string') changes.title = changes.title.trim()
    const now = new Date().toISOString()
    if (patch.status !== undefined) {
      changes.status = patch.status
      if (patch.status === 'sent') changes.sent_at = patch.sent_at ?? doc.sent_at ?? now
      if (patch.status === 'signed') {
        changes.sent_at = doc.sent_at ?? now
        changes.signed_at = patch.signed_at ?? doc.signed_at ?? now
      }
    }
    if (patch.sent_at !== undefined && patch.status === undefined) changes.sent_at = patch.sent_at
    if (patch.signed_at !== undefined && patch.status === undefined) changes.signed_at = patch.signed_at

    const updated = await row<ClientDocument>(
      supabase().from('documents').update(changes).eq('id', id).select().single(),
      NOT_FOUND,
    )
    // Sending a document opens its file to the client.
    if (patch.status !== undefined && doc.file_id) {
      await supabase().from('files').update({ visibility: fileVisibility(patch.status) }).eq('id', doc.file_id)
    }
    return (await withFileLinks([updated]))[0] as ClientDocument
  },

  async remove(id) {
    const doc = await maybeRow<ClientDocument>(supabase().from('documents').select('*').eq('id', id).maybeSingle())
    if (!doc) throw new DataError('not_found', "We couldn't find that document.")
    await deleted(
      supabase().from('documents').delete().eq('id', id).select('id'),
      new DataError('forbidden', "You can't delete that document."),
    )
    if (doc.file_id) {
      const file = await maybeRow<{ storage_key: string }>(
        supabase().from('files').select('storage_key').eq('id', doc.file_id).maybeSingle(),
      )
      await supabase().from('files').delete().eq('id', doc.file_id)
      if (file) await discardUpload(file.storage_key)
    }
  },
}
