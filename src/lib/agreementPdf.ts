import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage, PDFEmbeddedPage, PDFImage } from 'pdf-lib'
import type { Agreement } from '../types/db'
import type { AgreementContent } from '../types/agreement'

// The agreement body on the Vernex letterhead (public/templates/AGREEMENT_TEMPLATE.pdf).
// Every page is A4 with the letterhead behind it; the text sits in the white area between the
// header band and the footer shape. The fixed closing page is appended separately
// (agreementClosingPage.ts). The browser preview, the mock and the Edge Function all use this file,
// so the downloaded PDF matches the preview exactly.

export type AgreementPdfInput = Pick<Agreement, 'title' | 'signed_content' | 'founder_signed_at' | 'client_signed_at' | 'founder_user_id' | 'client_user_id'> & {
  founderName: string
  clientName: string
  /** The letterhead PDF. Without it the pages are plain white with the same margins. */
  letterhead?: Uint8Array
  /** Pages added after the body (the closing page), counted in "Page x of y". */
  trailingPages?: number
}

export const LETTERHEAD_URL = '/templates/AGREEMENT_TEMPLATE.pdf'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
// Measured on the letterhead: the header band ends 150pt from the top and the footer shape rises
// 30pt from the bottom. The side margins line up with the text on the closing page.
const MARGIN_X = 58
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2
const CONTENT_TOP = PAGE_HEIGHT - 150 - 30
const CONTENT_BOTTOM = 72
const FOOTER_Y = 40

const INK = rgb(0.09, 0.09, 0.09)
const MUTED = rgb(0.4, 0.38, 0.35)
const NAVY = rgb(0.11, 0.16, 0.27)
const GOLD = rgb(0.73, 0.54, 0.21)

const BODY = 10
const LEADING = 15
const INDENT = 14

type Fonts = { regular: PDFFont; bold: PDFFont }

/** DD/MM/YYYY for a YYYY-MM-DD date; anything else unchanged. */
function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value.trim()
}

/** Characters the standard fonts cannot draw are replaced, so a stray symbol never breaks the PDF. */
function printable(value: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet())
  return Array.from(value.replace(/₹\s?/g, 'INR ').replace(/\t/g, '    '))
    .map((char) => (supported.has(char.codePointAt(0) as number) ? char : '?'))
    .join('')
}

type Line = { words: string[]; last: boolean }

/** Wraps by measured width. A word longer than the line is broken into pieces. */
function wrap(value: string, font: PDFFont, size: number, width: number): Line[] {
  const lines: Line[] = []
  const space = font.widthOfTextAtSize(' ', size)
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push({ words: [], last: true })
      continue
    }
    let current: string[] = []
    let currentWidth = 0
    for (const original of words) {
      const pieces: string[] = []
      let rest = original
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--
        pieces.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      pieces.push(rest)
      for (const word of pieces) {
        const wordWidth = font.widthOfTextAtSize(word, size)
        if (current.length && currentWidth + space + wordWidth > width) {
          lines.push({ words: current, last: false })
          current = []
          currentWidth = 0
        }
        currentWidth += (current.length ? space : 0) + wordWidth
        current.push(word)
      }
    }
    lines.push({ words: current, last: true })
  }
  return lines
}

type Align = 'left' | 'center' | 'right' | 'justify'

type AgreementBranding = {
  customLogoImage?: PDFImage | null
  removeLogo?: boolean
  customTagline?: string | null
}

class Writer {
  pages: PDFPage[] = []
  page!: PDFPage
  y = CONTENT_TOP

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: Fonts,
    private readonly letterhead: PDFEmbeddedPage | null,
    private readonly branding?: AgreementBranding,
  ) {
    this.newPage()
  }

  newPage() {
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    if (this.letterhead) {
      this.page.drawPage(this.letterhead, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT })
      this.applyLetterheadBranding()
    }
    this.pages.push(this.page)
    this.y = CONTENT_TOP
  }

  private applyLetterheadBranding() {
    if (!this.branding) return
    const BG_GREY = rgb(230 / 255, 231 / 255, 230 / 255)

    // Handle logo override or removal
    if (this.branding.removeLogo || this.branding.customLogoImage) {
      // Cover default logo area on the template
      this.page.drawRectangle({ x: 30, y: 765, width: 230, height: 72, color: BG_GREY })
      if (this.branding.customLogoImage) {
        const img = this.branding.customLogoImage
        const maxW = 180
        const maxH = 55
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const imgW = img.width * scale
        const imgH = img.height * scale
        const imgX = 45
        const imgY = 770 + (maxH - imgH) / 2
        this.page.drawImage(img, { x: imgX, y: imgY, width: imgW, height: imgH })
      }
    }

    // Handle tagline override or removal
    if (this.branding.customTagline !== undefined && this.branding.customTagline !== null) {
      const trimmed = this.branding.customTagline.trim()
      if (trimmed !== 'Crafting your digital narrative.') {
        this.page.drawRectangle({ x: 30, y: 744, width: 230, height: 20, color: BG_GREY })
        if (trimmed) {
          const font = this.fonts.bold
          const tagText = printable(trimmed, font)
          this.page.drawText(tagText, {
            x: 48,
            y: 750,
            size: 9.5,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
        }
      }
    }
  }

  /** Starts a new page unless `height` more points fit on this one. */
  ensure(height: number) {
    if (this.y - height < CONTENT_BOTTOM) this.newPage()
  }

  space(points: number) {
    // Space at the top of a page is dropped so every page starts at the same line.
    if (this.y < CONTENT_TOP) this.y -= points
  }

  lines(value: string, size: number, bold: boolean, width: number) {
    const font = bold ? this.fonts.bold : this.fonts.regular
    return wrap(printable(value, font), font, size, width)
  }

  text(
    value: string,
    options: { size?: number; bold?: boolean; indent?: number; align?: Align; color?: ReturnType<typeof rgb>; leading?: number; keep?: number } = {},
  ) {
    const { size = BODY, bold = false, indent = 0, align = 'left', color = INK, leading = size * 1.5, keep = 1 } = options
    const font = bold ? this.fonts.bold : this.fonts.regular
    const width = CONTENT_WIDTH - indent
    const lines = this.lines(value, size, bold, width)
    // Keep the first `keep` lines together so a paragraph never starts with one line at a page foot.
    this.ensure(Math.min(keep, lines.length) * leading)
    const space = font.widthOfTextAtSize(' ', size)
    for (const line of lines) {
      this.ensure(leading)
      const baseline = this.y - size
      const natural = line.words.reduce((sum, word) => sum + font.widthOfTextAtSize(word, size), 0)
      const gaps = line.words.length - 1
      const textWidth = natural + gaps * space
      let x = MARGIN_X + indent
      if (align === 'center') x += (width - textWidth) / 2
      if (align === 'right') x += width - textWidth
      // Justified lines spread their spaces; a line that would gape (few long words) stays left aligned.
      const stretch = align === 'justify' && !line.last && gaps > 0 ? (width - natural) / gaps : space
      const wordGap = stretch <= space * 3.5 ? stretch : space
      for (const word of line.words) {
        this.page.drawText(word, { x, y: baseline, size, font, color })
        x += font.widthOfTextAtSize(word, size) + wordGap
      }
      this.y -= leading
    }
  }

  rule(width: number, color = GOLD, thickness = 0.8) {
    const x = MARGIN_X + (CONTENT_WIDTH - width) / 2
    this.page.drawLine({ start: { x, y: this.y }, end: { x: x + width, y: this.y }, thickness, color })
  }
}

/** The agreement body as A4 pages on the letterhead, with "Page x of y" on each. */
export async function buildAgreementPdf(input: AgreementPdfInput): Promise<Uint8Array> {
  const content = input.signed_content
  if (!content) throw new Error('Agreement content is required to generate the PDF.')

  const document = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  }
  let letterhead: PDFEmbeddedPage | null = null
  if (input.letterhead?.length) {
    const [embedded] = await document.embedPdf(input.letterhead, [0])
    letterhead = embedded ?? null
  }

  let customLogoImage: PDFImage | null = null
  let removeLogo = false
  if (content.logoUrl !== undefined && content.logoUrl !== null) {
    if (content.logoUrl.trim() === '') {
      removeLogo = true
    } else {
      let mime: string
      let bytes: Uint8Array
      if (content.logoUrl.startsWith('data:')) {
        const separator = content.logoUrl.indexOf(',')
        if (separator < 0) throw new Error('The custom logo data is invalid.')
        mime = content.logoUrl.slice(5, content.logoUrl.indexOf(';')).toLowerCase()
        const binary = atob(content.logoUrl.slice(separator + 1))
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      } else {
        const response = await fetch(content.logoUrl)
        if (!response.ok) throw new Error('The custom logo could not be loaded.')
        mime = (response.headers.get('content-type') ?? '').split(';')[0]?.toLowerCase() ?? ''
        bytes = new Uint8Array(await response.arrayBuffer())
      }
      if (mime === 'image/png') customLogoImage = await document.embedPng(bytes)
      else if (mime === 'image/jpeg' || mime === 'image/jpg') customLogoImage = await document.embedJpg(bytes)
      else throw new Error('Agreement logos must be PNG or JPEG images.')
    }
  }

  const branding: AgreementBranding = {
    customLogoImage,
    removeLogo,
    customTagline: content.tagline !== undefined ? content.tagline : null,
  }

  const w = new Writer(document, fonts, letterhead, branding)
  const fill = (body: string) =>
    body
      .replace(/{{projectTitle}}/g, content.projectTitle)
      .replace(/{{developerName}}/g, content.developerName)
      .replace(/{{companyName}}/g, content.companyName)
      .replace(/{{companySigner}}/g, content.companySigner)

  // Title block.
  w.text('DEVELOPER ENGAGEMENT & NON-OWNERSHIP AGREEMENT', { size: 13, bold: true, align: 'center', color: NAVY, leading: 18 })
  w.space(4)
  w.rule(110)
  w.space(14)
  w.text(input.title.toUpperCase(), { size: 11, bold: true, align: 'center', leading: 16 })
  if (content.projectTitle.trim() && !input.title.toLowerCase().includes(content.projectTitle.trim().toLowerCase())) {
    w.text(content.projectTitle, { size: 10, align: 'center', color: MUTED })
  }
  w.space(10)
  if (content.agreementDate.trim()) w.text(`Date: ${displayDate(content.agreementDate)}`, { size: 9.5, align: 'right', color: MUTED })
  w.space(6)

  // Parties.
  w.text(`This Agreement is made on this ${displayDate(content.agreementDate)}, at Chennai, India, by and between:`, { align: 'justify' })
  w.space(4)
  w.text(
    `${content.companyName}, represented by Mr. ${content.companySigner}, ${content.companyTitle}, hereinafter referred to as the "Company" (which includes its successors and assigns),`,
    { indent: INDENT, align: 'justify', keep: 2 },
  )
  w.space(4)
  w.text('AND', { bold: true, align: 'center' })
  w.space(4)
  w.text(
    `${content.clientName || content.developerName}, hereinafter referred to as the "Developer" (which expression shall include his heirs, legal representatives, and permitted assigns).`,
    { indent: INDENT, align: 'justify', keep: 2 },
  )
  if (content.clientEmail.trim()) w.text(`Email: ${content.clientEmail}`, { indent: INDENT, size: 9.5, color: MUTED })

  // Agreement details.
  const term = [content.startDate && `Start: ${displayDate(content.startDate)}`, content.endDate && `End: ${displayDate(content.endDate)}`]
    .filter(Boolean)
    .join('   |   ')
  const sections: [string, string][] = [
    ['SERVICES', content.services],
    ['SCOPE OF WORK', content.scope],
    ['PAYMENT TERMS', content.paymentTerms],
    ['TERM DATES', term],
  ]
  for (const [label, value] of sections) {
    if (!value.trim()) continue
    w.space(10)
    // The label never sits alone at the foot of a page.
    w.ensure(LEADING * 3)
    w.text(label, { size: 10, bold: true, color: NAVY })
    w.text(value, { indent: INDENT, align: 'justify', keep: 2 })
  }

  // Terms and conditions.
  if (content.clauses.length) {
    w.space(16)
    w.ensure(LEADING * 5)
    w.text('TERMS AND CONDITIONS', { size: 11.5, bold: true, align: 'center', color: NAVY, leading: 16 })
    w.space(3)
    w.rule(110)
    w.space(12)
    for (const clause of content.clauses) {
      w.ensure(LEADING * 3)
      w.text(`${clause.number}. ${clause.title}`, { size: 10.5, bold: true, leading: 16 })
      w.text(fill(clause.body), { indent: INDENT, align: 'justify', keep: 2 })
      w.space(8)
    }
  }

  const total = w.pages.length + (input.trailingPages ?? 0)
  w.pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${total}`
    const size = 8
    page.drawText(label, {
      x: (PAGE_WIDTH - fonts.regular.widthOfTextAtSize(label, size)) / 2,
      y: FOOTER_Y,
      size,
      font: fonts.regular,
      color: MUTED,
    })
  })

  document.setTitle(input.title)
  document.setProducer('Vernex Hub')
  return document.save()
}

export function agreementContentForSnapshot(content: AgreementContent): AgreementContent {
  return structuredClone(content)
}
