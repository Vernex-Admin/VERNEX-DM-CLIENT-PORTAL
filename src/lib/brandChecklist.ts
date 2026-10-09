import type { FileRecord } from '../types/db'

export const MIN_PRODUCT_PHOTOS = 5

export type ChecklistItem = {
  id: 'logo' | 'colours' | 'fonts' | 'photos'
  label: string
  /** For the photos item, how many have been uploaded of how many are needed. */
  detail?: string
  done: boolean
}

const IMAGE = /\.(png|jpe?g|webp|svg)$/i
const isLogo = (name: string) => /logo/i.test(name) && /\.(svg|png)$/i.test(name)
const isColours = (name: string) => /colou?rs?|palette/i.test(name)
const isFont = (name: string) => /fonts?|typeface/i.test(name) || /\.(ttf|otf|woff2?)$/i.test(name)
// A product photo is any other image, so the logo never counts towards the five.
const isPhoto = (name: string) => IMAGE.test(name) && !isLogo(name) && !isColours(name)

/** What the client still owes in Brand Assets, worked out from the file names. */
export function brandChecklist(files: Pick<FileRecord, 'name'>[]): ChecklistItem[] {
  const names = files.map((file) => file.name)
  const photos = names.filter(isPhoto).length
  return [
    { id: 'logo', label: 'Logo (SVG or PNG)', done: names.some(isLogo) },
    { id: 'colours', label: 'Brand colours', done: names.some(isColours) },
    { id: 'fonts', label: 'Fonts', done: names.some(isFont) },
    {
      id: 'photos',
      label: `${MIN_PRODUCT_PHOTOS} or more product photos`,
      detail: `${Math.min(photos, MIN_PRODUCT_PHOTOS)} of ${MIN_PRODUCT_PHOTOS}`,
      done: photos >= MIN_PRODUCT_PHOTOS,
    },
  ]
}

export function checklistPercent(items: ChecklistItem[]): number {
  return items.length === 0 ? 0 : Math.round((items.filter((item) => item.done).length / items.length) * 100)
}
