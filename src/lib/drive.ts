import type { PreviewKind } from '../types/db'

/**
 * A Google Drive or Docs share link as the embeddable preview link, or null when it is not one.
 * `https://drive.google.com/file/d/ID/view?usp=sharing` becomes `https://drive.google.com/file/d/ID/preview`.
 */
export function toDrivePreview(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  if (url.hostname === 'drive.google.com') {
    const file = url.pathname.match(/^\/file\/d\/([\w-]+)/)
    if (file) return `https://drive.google.com/file/d/${file[1]}/preview`
    const id = url.pathname === '/open' ? url.searchParams.get('id') : null
    if (id && /^[\w-]+$/.test(id)) return `https://drive.google.com/file/d/${id}/preview`
    return null
  }
  if (url.hostname === 'docs.google.com') {
    const doc = url.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([\w-]+)/)
    if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`
  }
  return null
}

/** What a browser-uploaded file previews as, or null when the reviewer cannot show it. */
export function previewKindOf(mimeType: string): Exclude<PreviewKind, 'drive'> | null {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'pdf'
  return null
}
