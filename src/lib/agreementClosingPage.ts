import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const CLOSING_PAGE_URL = '/vernex-agreement-closing-page.pdf'
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

export async function appendClosingPage(
  agreementPdf: Uint8Array,
  closingPagePdf: Uint8Array,
  client: { name: string; signature?: Uint8Array; signedAt?: string | null; timeZone?: string | null },
) {
  const document = await PDFDocument.load(agreementPdf)
  const template = await PDFDocument.load(closingPagePdf)
  const [page] = await document.copyPages(template, [0])
  if (!page) throw new Error('The closing page template is empty.')
  const sourceSize = page.getSize()
  page.scale(A4_WIDTH / sourceSize.width, A4_HEIGHT / sourceSize.height)
  document.addPage(page)

  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const scale = A4_WIDTH / 595.5
  const timestamp = client.signedAt && client.timeZone
    ? `Client signed at: ${new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
      hour12: true, timeZone: client.timeZone, timeZoneName: 'short',
    }).format(new Date(client.signedAt))} (${client.timeZone})`
    : null

  if (client.signature?.length) {
    const isPng = client.signature[0] === 137 && client.signature[1] === 80
    const signature = isPng ? await document.embedPng(client.signature) : await document.embedJpg(client.signature)
    const maxWidth = 155 * scale
    const maxHeight = 48 * scale
    const imageSize = signature.scale(Math.min(maxWidth / signature.width, maxHeight / signature.height))
    page.drawImage(signature, {
      x: 290 * scale, y: 151 * scale, width: imageSize.width, height: imageSize.height,
    })
  }

  // Fill the original blank client name line without changing the page artwork.
  page.drawRectangle({ x: 374 * scale, y: 126 * scale, width: 151 * scale, height: 19 * scale, color: rgb(1, 1, 1) })
  const nameWidth = font.widthOfTextAtSize(client.name, 8.1)
  const nameSize = Math.max(5.5, Math.min(8.1, (146 / Math.max(nameWidth, 1)) * 8.1)) * scale
  page.drawText(client.name, { x: 376 * scale, y: 132 * scale, size: nameSize, font, color: rgb(0.08, 0.08, 0.08) })

  // The same completion time sits below both signature blocks; the founder's
  // actual authenticated approval time remains in the agreement audit history.
  if (timestamp) for (const x of [55, 298]) {
    page.drawText(timestamp, {
      x: x * scale, y: 66 * scale, size: 6.1 * scale, font: bold,
      color: rgb(0.08, 0.08, 0.08), maxWidth: 245 * scale, lineHeight: 7.1 * scale,
    })
  }
  return document.save()
}
