import type { FileFolder, FileRecord } from '../../types/db'
import { DataError } from '../types'
import { supabase } from './client'

// The private "vault" bucket (04_storage.sql). Rows in public.files decide who may read an object.
export const VAULT = 'vault'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const OVER_LIMIT_MESSAGE = 'Files over 50 MB go on Google Drive'
/** How long a signed link lives. Links are made when a file is shown, never stored. */
export const SIGNED_URL_SECONDS = 900

/** Lowercase, spaces to dashes, and nothing but a-z 0-9 . - _ */
export function safeFileName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
  return cleaned.replace(/^\.+/, '') || 'file'
}

/** clients/<client_id>/<folder>/<timestamp>-<safe file name> */
export function storagePath(clientId: string, folder: FileFolder, fileName: string, now: number = Date.now()): string {
  return `clients/${clientId}/${folder}/${now}-${safeFileName(fileName)}`
}

/** Uploads to the vault first. The caller inserts the files row and calls `discardUpload` if that fails. */
export async function uploadToVault(clientId: string, folder: FileFolder, file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new DataError('invalid', OVER_LIMIT_MESSAGE)
  const path = storagePath(clientId, folder, file.name)
  const { error } = await supabase()
    .storage.from(VAULT)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw new DataError('invalid', 'Could not upload that file. Try again.')
  return path
}

/** Best effort: an orphaned object is harmless, a failed cleanup must not hide the original error. */
export async function discardUpload(path: string): Promise<void> {
  if (!path) return
  await supabase().storage.from(VAULT).remove([path])
}

/** Removes many objects, a batch at a time. Best effort, like `discardUpload`. */
export async function discardUploads(paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))]
  for (let start = 0; start < unique.length; start += 100) {
    await supabase().storage.from(VAULT).remove(unique.slice(start, start + 100))
  }
}

/** A signed link for each path (900 seconds). Paths that cannot be signed are left out. */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const urls = new Map<string, string>()
  if (unique.length === 0) return urls
  const { data } = await supabase().storage.from(VAULT).createSignedUrls(unique, SIGNED_URL_SECONDS)
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl)
  }
  return urls
}

/** Fills `url` on each uploaded file with a fresh signed link. Linked (Drive) files keep `external_url`. */
export async function withSignedUrls(files: FileRecord[]): Promise<FileRecord[]> {
  const urls = await signedUrls(files.filter((f) => !f.external_url).map((f) => f.storage_key))
  return files.map((file) => ({ ...file, url: file.external_url ? null : (urls.get(file.storage_key) ?? null) }))
}
