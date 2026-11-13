import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import type { AgreementLetterhead } from '../types/agreement'
import { printable } from './agreementPdf'

// The fixed last page ("Thank you for choosing Vernex", both signature blocks). It is the same for
// every client: nothing is written on it until the client has signed. Then the client's signature,
// name and the signing dates go on the existing lines, without covering any of the artwork.

export const CLOSING_PAGE_URL = '/vernex-agreement-closing-page.pdf'
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

// Positions on the 595.5pt-wide artwork, measured from its lines.
const CLIENT_NAME_LINE = { x: 377, y: 132, width: 133 }
const CLIENT_DATE_LINE = { x: 334, y: 95, width: 146 }
const FOUNDER_DATE_LINE = { x: 91, y: 95, width: 138 }
const CLIENT_SIGNATURE = { x: 300, y: 150, width: 160, height: 46 }
const TIMESTAMP_Y = 68
const COLUMNS = [55.5, 298]

function formatDate(value: string, timeZone: string | null | undefined) {
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timeZone || 'Asia/Kolkata' }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value))
  }
}

/** Covers the Digital Marketing logo, header text, thank-you paragraph and signer company. */
async function rebrandClosingPage(document: PDFDocument, page: PDFPage, brand: AgreementLetterhead) {
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const scale = A4_WIDTH / 595.5
  const box = page.getMediaBox()
  const at = (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale })
  const cover = (x: number, y: number, width: number, height: number, color: ReturnType<typeof rgb>) =>
    page.drawRectangle({ ...at(x, y), width: width * scale, height: height * scale, color })
  const ink = rgb(0.05, 0.05, 0.05)
  const grey = rgb(236 / 255, 238 / 255, 237 / 255)
  const white = rgb(1, 1, 1)

  // Header: logo on the left, company block on the right.
  cover(28, 730, 260, 106, grey)
  cover(330, 730, 262, 88, grey)
  const response = await fetch(brand.logoUrl)
  if (response.ok) {
    const logo = await document.embedPng(new Uint8Array(await response.arrayBuffer()))
    const size = logo.scale(Math.min((200 * scale) / logo.width, (72 * scale) / logo.height))
    page.drawImage(logo, { ...at(52, 742), width: size.width, height: size.height })
  }
  const right = (text: string, y: number, size: number, f = font) =>
    page.drawText(text, { ...at(571 - f.widthOfTextAtSize(text, size), y), size: size * scale, font: f, color: ink })
  right(brand.name, 798.5, 13, bold)
  right(brand.phone, 783.5, 10.5)
  if (brand.email) right(brand.email, 768.5, 9)
  right(brand.website, 745, 11.5, bold)

  // The thank-you paragraph, rewrapped for this company.
  cover(50, 534, 470, 88, white)
  const paragraph = `Thank you for choosing ${brand.name} as your technology partner. We look forward to building a transparent, collaborative partnership focused on meaningful results, consistent communication, and long-term growth for your business.`
  const lines: string[] = []
  for (const word of paragraph.split(' ')) {
    const last = lines[lines.length - 1]
    if (last !== undefined && font.widthOfTextAtSize(`${last} ${word}`, 11) <= 450) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  lines.forEach((line, index) =>
    page.drawText(line, { ...at(56, 603 - index * 20.5), size: 11 * scale, font, color: rgb(0.15, 0.15, 0.18) }),
  )

  // Company line under "CEO & Founder".
  cover(52, 209, 200, 23, white)
  page.drawText(brand.name, { ...at(56, 216), size: 11 * scale, font, color: ink })
}

export async function appendClosingPage(
  agreementPdf: Uint8Array,
  closingPagePdf: Uint8Array,
  client: {
    name: string
    signature?: Uint8Array
    signedAt?: string | null
    timeZone?: string | null
    /** When the founder approved; written on the founder's Date line once the client has signed. */
    founderSignedAt?: string | null
  },
  /** Another company's letterhead over the Vernex Digital Marketing artwork. */
  brand?: AgreementLetterhead | null,
) {
  const document = await PDFDocument.load(agreementPdf)
  const template = await PDFDocument.load(closingPagePdf)
  const [page] = await document.copyPages(template, [0])
  if (!page) throw new Error('The closing page template is empty.')
  const sourceSize = page.getSize()
  page.scale(A4_WIDTH / sourceSize.width, A4_HEIGHT / sourceSize.height)
  document.addPage(page)
  if (brand) await rebrandClosingPage(document, page, brand)

  // Unsigned: the page goes in exactly as designed.
  if (!client.signedAt) return document.save()

  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const scale = A4_WIDTH / 595.5
  const ink = rgb(0.08, 0.08, 0.08)
  // The artwork's page box does not start at 0 (it starts about 7.8pt up), so every position is
  // measured from the visible corner of the page.
  const box = page.getMediaBox()
  const at = (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale })

  /** Text that sits just above a line, shrunk to fit its width. */
  const onLine = (raw: string, line: { x: number; y: number; width: number }, size = 10) => {
    const text = printable(raw, font)
    const fitted = Math.max(6, Math.min(size, (size * (line.width - 4)) / Math.max(font.widthOfTextAtSize(text, size), 1)))
    page.drawText(text, { ...at(line.x + 2, line.y + 3), size: fitted * scale, font, color: ink })
  }

  if (client.signature?.length) {
    const isPng = client.signature[0] === 137 && client.signature[1] === 80
    const signature = isPng ? await document.embedPng(client.signature) : await document.embedJpg(client.signature)
    const area = CLIENT_SIGNATURE
    const size = signature.scale(Math.min((area.width * scale) / signature.width, (area.height * scale) / signature.height))
    page.drawImage(signature, { ...at(area.x, area.y), width: size.width, height: size.height })
  }

  if (client.name.trim()) onLine(client.name.trim(), CLIENT_NAME_LINE)
  onLine(formatDate(client.signedAt, client.timeZone), CLIENT_DATE_LINE)
  if (client.founderSignedAt) onLine(formatDate(client.founderSignedAt, 'Asia/Kolkata'), FOUNDER_DATE_LINE)

  // The exact completion time, in the client's own time zone, under both signature blocks; the
  // founder's own approval time stays in the agreement history.
  if (client.timeZone) {
    const timestamp = `Client signed at: ${new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
      hour12: true, timeZone: client.timeZone, timeZoneName: 'short',
    }).format(new Date(client.signedAt))} (${client.timeZone})`
    for (const x of COLUMNS) {
      page.drawText(timestamp, {
        ...at(x, TIMESTAMP_Y), size: 6.2 * scale, font: bold,
        color: ink, maxWidth: 235 * scale, lineHeight: 7.4 * scale,
      })
    }
  }
  return document.save()
}
