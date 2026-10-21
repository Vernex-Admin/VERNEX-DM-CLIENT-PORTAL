import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib'
import arimo400 from '@fontsource/arimo/files/arimo-latin-400-normal.woff?url'
import arimo400Ext from '@fontsource/arimo/files/arimo-latin-ext-400-normal.woff?url'
import arimo400Italic from '@fontsource/arimo/files/arimo-latin-400-italic.woff?url'
import arimo400ItalicExt from '@fontsource/arimo/files/arimo-latin-ext-400-italic.woff?url'
import arimo700 from '@fontsource/arimo/files/arimo-latin-700-normal.woff?url'
import arimo700Ext from '@fontsource/arimo/files/arimo-latin-ext-700-normal.woff?url'
import arimo700Italic from '@fontsource/arimo/files/arimo-latin-700-italic.woff?url'
import arimo700ItalicExt from '@fontsource/arimo/files/arimo-latin-ext-700-italic.woff?url'
import cormorant700 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff?url'
import cormorant700Ext from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-ext-700-normal.woff?url'

// Turns the laid-out A4 invoice pages into a vector PDF. Every position comes from the browser's
// own layout of the same pages the preview shows (and print uses), drawn with the same font files
// the page loads (src/styles/index.css), so line breaks and alignment match. Text stays selectable.

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89

/** The text has a character none of the invoice fonts can draw; print to PDF instead. */
export class UnsupportedTextError extends Error {
  constructor(readonly character: string) {
    super(`The invoice contains a character the PDF fonts cannot draw: "${character}".`)
    this.name = 'UnsupportedTextError'
  }
}

type FaceKey = 'arimo-400' | 'arimo-400-italic' | 'arimo-700' | 'arimo-700-italic' | 'cormorant-700'

/**
 * Each face as [latin, latin-ext]: the ₹ sign lives in latin-ext. These are the WOFF copies of the
 * WOFF2 files the page shows: same glyphs, but pdf-lib's subsetter mangles WOFF2 outlines.
 */
const FACE_FILES: Record<FaceKey, [string, string]> = {
  'arimo-400': [arimo400, arimo400Ext],
  'arimo-400-italic': [arimo400Italic, arimo400ItalicExt],
  'arimo-700': [arimo700, arimo700Ext],
  'arimo-700-italic': [arimo700Italic, arimo700ItalicExt],
  'cormorant-700': [cormorant700, cormorant700Ext],
}

type LoadedFont = { pdf: PDFFont; has: (codePoint: number) => boolean; ascent: number; descent: number }

/** Which face the browser used for an element, by its computed style. */
export function faceOf(style: Pick<CSSStyleDeclaration, 'fontFamily' | 'fontWeight' | 'fontStyle'>): FaceKey {
  if (/cormorant/i.test(style.fontFamily)) return 'cormorant-700'
  const bold = Number.parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold'
  const italic = style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique')
  return `arimo-${bold ? 700 : 400}${italic ? '-italic' : ''}` as FaceKey
}

/** "rgb(15, 42, 69)" or "rgba(0, 0, 0, 0)" to a pdf-lib colour, or null when transparent. */
export function parseColor(value: string): { color: RGB; alpha: number } | null {
  const match = /rgba?\(([^)]+)\)/.exec(value)
  if (!match) return null
  const parts = (match[1] ?? '').split(/[\s,/]+/).filter(Boolean).map(Number)
  const [r = 0, g = 0, b = 0, a = 1] = parts
  if (a <= 0) return null
  return { color: rgb(r / 255, g / 255, b / 255), alpha: a }
}

/** Where a glyph's baseline sits in a text box `height` tall, for a font of `size` with these metrics. */
export function baselineOffset(height: number, size: number, ascent: number, descent: number): number {
  return (height - (ascent + descent) * size) / 2 + ascent * size
}

/** The box an `object-fit: contain` image is drawn in. */
export function containBox(box: { x: number; y: number; width: number; height: number }, natural: { width: number; height: number }) {
  if (!natural.width || !natural.height) return box
  const scale = Math.min(box.width / natural.width, box.height / natural.height)
  const width = natural.width * scale
  const height = natural.height * scale
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }
}

class Fonts {
  private files = new Map<string, LoadedFont>()
  constructor(private pdf: PDFDocument) {}

  async load() {
    await Promise.all(
      Object.values(FACE_FILES).flat().map(async (url) => {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
        const kit = fontkit.create(bytes)
        const pdf = await this.pdf.embedFont(bytes, { subset: true })
        this.files.set(url, {
          pdf,
          has: (codePoint) => kit.hasGlyphForCodePoint(codePoint),
          ascent: kit.ascent / kit.unitsPerEm,
          descent: Math.abs(kit.descent) / kit.unitsPerEm,
        })
      }),
    )
  }

  /** The file of this face that has the character. */
  pick(face: FaceKey, character: string): LoadedFont {
    const codePoint = character.codePointAt(0) ?? 0
    for (const url of FACE_FILES[face]) {
      const font = this.files.get(url)
      if (font?.has(codePoint)) return font
    }
    throw new UnsupportedTextError(character)
  }

  primary(face: FaceKey): LoadedFont {
    return this.files.get(FACE_FILES[face][0]) as LoadedFont
  }
}

async function imageBytes(src: string): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' }> {
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer())
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, kind: 'png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, kind: 'jpg' }
  // WebP and anything else: redraw as PNG.
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = src
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  canvas.getContext('2d')?.drawImage(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not prepare an image for the PDF.')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'png' }
}

/** Rounded rectangle as an SVG path whose origin is the top-left corner (pdf-lib flips y). */
function roundedPath(width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  return `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
}

type TextRun = { text: string; x: number; top: number; height: number; font: LoadedFont; face: FaceKey; size: number; color: RGB }

class PageWriter {
  private readonly scale: number
  private readonly origin: DOMRect

  constructor(
    private readonly page: PDFPage,
    private readonly element: HTMLElement,
    private readonly fonts: Fonts,
    private readonly images: Map<string, Promise<PDFImage>>,
    private readonly pdf: PDFDocument,
  ) {
    this.origin = element.getBoundingClientRect()
    this.scale = PAGE_WIDTH / this.origin.width
  }

  /** The page clips its content (overflow: hidden), so nothing past its edges is drawn. */
  private outside(box: DOMRect) {
    return box.top >= this.origin.bottom || box.bottom <= this.origin.top || box.left >= this.origin.right || box.right <= this.origin.left
  }

  private x(px: number) {
    return (px - this.origin.left) * this.scale
  }

  private y(px: number) {
    return PAGE_HEIGHT - (px - this.origin.top) * this.scale
  }

  private rect(left: number, top: number, width: number, height: number, color: RGB, opacity = 1) {
    this.page.drawRectangle({
      x: this.x(left),
      y: this.y(top + height),
      width: width * this.scale,
      height: height * this.scale,
      color,
      opacity,
    })
  }

  /** Backgrounds, borders and images, in document order, under the text. */
  async boxes() {
    const elements = [this.element, ...this.element.querySelectorAll<HTMLElement>('*')]
    for (const element of elements) {
      if (element.closest('.ivx-stamp')) continue
      const box = element.getBoundingClientRect()
      if ((box.width <= 0 && box.height <= 0) || this.outside(box)) continue
      const style = getComputedStyle(element)
      if (style.display === 'none') continue

      const background = parseColor(style.backgroundColor)
      if (background && box.width > 0 && box.height > 0) {
        const radius = Number.parseFloat(style.borderTopLeftRadius) || 0
        if (radius > 0) {
          this.page.drawSvgPath(roundedPath(box.width * this.scale, box.height * this.scale, radius * this.scale), {
            x: this.x(box.left),
            y: this.y(box.top),
            color: background.color,
            opacity: background.alpha,
            borderWidth: 0,
          })
        } else {
          this.rect(box.left, box.top, box.width, box.height, background.color, background.alpha)
        }
      }

      // Collapsed table borders straddle the cell edge; others sit inside the box.
      const straddle = style.borderCollapse === 'collapse' && (element.tagName === 'TD' || element.tagName === 'TH')
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        const width = Number.parseFloat(style[`border${side}Width`]) || 0
        const color = parseColor(style[`border${side}Color`])
        if (width <= 0 || !color || style[`border${side}Style`] === 'none' || style[`border${side}Style`] === 'hidden') continue
        const shift = straddle ? width / 2 : 0
        if (side === 'Top') this.rect(box.left - shift, box.top - shift, box.width + shift * 2, width, color.color, color.alpha)
        if (side === 'Bottom') this.rect(box.left - shift, box.bottom - width + shift, box.width + shift * 2, width, color.color, color.alpha)
        if (side === 'Left') this.rect(box.left - shift, box.top - shift, width, box.height + shift * 2, color.color, color.alpha)
        if (side === 'Right') this.rect(box.right - width + shift, box.top - shift, width, box.height + shift * 2, color.color, color.alpha)
      }

      if (element instanceof HTMLImageElement && element.src) {
        const source = element.currentSrc || element.src
        let image = this.images.get(source)
        if (!image) {
          image = imageBytes(source).then(({ bytes, kind }) => (kind === 'png' ? this.pdf.embedPng(bytes) : this.pdf.embedJpg(bytes)))
          this.images.set(source, image)
        }
        const embedded = await image
        const drawn = containBox(
          { x: box.left, y: box.top, width: box.width, height: box.height },
          { width: element.naturalWidth || embedded.width, height: element.naturalHeight || embedded.height },
        )
        this.page.drawImage(embedded, {
          x: this.x(drawn.x),
          y: this.y(drawn.y + drawn.height),
          width: drawn.width * this.scale,
          height: drawn.height * this.scale,
        })
      }
    }
  }

  /** Every visible character, grouped into runs on the same line, in the same font, between spaces. */
  private runs(): TextRun[] {
    const runs: TextRun[] = []
    const range = document.createRange()
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const parent = node.parentElement
      if (!parent || parent.closest('.ivx-stamp, .sr-only')) continue
      const style = getComputedStyle(parent)
      const face = faceOf(style)
      const size = Number.parseFloat(style.fontSize)
      const color = parseColor(style.color)?.color ?? rgb(0, 0, 0)
      const upper = style.textTransform === 'uppercase'
      const spaced = style.letterSpacing !== 'normal' && Number.parseFloat(style.letterSpacing) !== 0
      let current: TextRun | null = null
      const flush = () => {
        if (current) runs.push(current)
        current = null
      }
      let index = 0
      for (const character of node.data) {
        const length = character.length
        if (/\s/.test(character)) {
          flush()
          index += length
          continue
        }
        range.setStart(node, index)
        range.setEnd(node, index + length)
        index += length
        const box = range.getClientRects()[0]
        if (!box || (box.width === 0 && box.height === 0) || this.outside(box)) {
          flush()
          continue
        }
        const drawn = upper ? character.toUpperCase() : character
        const font = this.fonts.pick(face, drawn)
        const run = current as TextRun | null
        if (run && !spaced && run.font === font && Math.abs(run.top - box.top) < 0.5) {
          run.text += drawn
        } else {
          flush()
          current = { text: drawn, x: box.left, top: box.top, height: box.height, font, face, size, color }
        }
      }
      flush()
    }
    return runs
  }

  text() {
    for (const run of this.runs()) {
      const metrics = this.fonts.primary(run.face)
      const baseline = run.top + baselineOffset(run.height, run.size, metrics.ascent, metrics.descent)
      this.page.drawText(run.text, { x: this.x(run.x), y: this.y(baseline), size: run.size * this.scale, font: run.font.pdf, color: run.color })
    }
  }

  /** The rotated PAID / CANCELLED stamp. */
  stamp() {
    const stamp = this.element.querySelector<HTMLElement>('.ivx-stamp')
    if (!stamp) return
    const style = getComputedStyle(stamp)
    const box = stamp.getBoundingClientRect()
    const matrix = /matrix\(([^)]+)\)/.exec(style.transform)?.[1]?.split(',').map(Number) ?? [1, 0]
    const theta = -Math.atan2(matrix[1] ?? 0, matrix[0] ?? 1)
    const color = parseColor(style.color)?.color ?? rgb(0, 0, 0)
    const width = stamp.offsetWidth * this.scale
    const height = stamp.offsetHeight * this.scale
    const cx = this.x(box.left + box.width / 2)
    const cy = this.y(box.top + box.height / 2)
    const at = (localX: number, localY: number) => ({
      x: cx + localX * Math.cos(theta) - localY * Math.sin(theta),
      y: cy + localX * Math.sin(theta) + localY * Math.cos(theta),
    })
    const corner = at(-width / 2, -height / 2)
    this.page.drawRectangle({
      ...corner,
      width,
      height,
      rotate: degrees((theta * 180) / Math.PI),
      borderColor: color,
      borderWidth: (Number.parseFloat(style.borderTopWidth) || 2) * this.scale,
    })
    const label = (stamp.textContent ?? '').toUpperCase()
    const face = faceOf(style)
    const size = Number.parseFloat(style.fontSize) * this.scale
    const spacing = (Number.parseFloat(style.letterSpacing) || 0) * this.scale
    const fonts = [...label].map((character) => this.fonts.pick(face, character))
    const advance = [...label].map((character, i) => (fonts[i] as LoadedFont).pdf.widthOfTextAtSize(character, size) + spacing)
    const total = advance.reduce((sum, value) => sum + value, 0) - spacing
    const metrics = this.fonts.primary(face)
    let offset = -total / 2
    ;[...label].forEach((character, i) => {
      const origin = at(offset, -((metrics.ascent - metrics.descent) / 2) * size)
      this.page.drawText(character, { ...origin, size, font: (fonts[i] as LoadedFont).pdf, color, rotate: degrees((theta * 180) / Math.PI) })
      offset += advance[i] ?? 0
    })
  }
}

/** A vector PDF of the given A4 page elements (laid out, unscaled), one PDF page each. */
export async function exportInvoicePdf(pages: HTMLElement[], title: string): Promise<Uint8Array> {
  await document.fonts?.ready
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(title)
  pdf.setCreator('Vernex Hub')
  pdf.setProducer('Vernex Hub')
  const fonts = new Fonts(pdf)
  await fonts.load()
  const images = new Map<string, Promise<PDFImage>>()
  for (const element of pages) {
    const writer = new PageWriter(pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), element, fonts, images, pdf)
    await writer.boxes()
    writer.text()
    writer.stamp()
  }
  return pdf.save()
}

/** Saves bytes as a file download. */
export function downloadFile(bytes: Uint8Array, fileName: string, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
