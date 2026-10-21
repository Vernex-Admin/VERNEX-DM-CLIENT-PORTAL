import type { Agreement } from '../types/db'
import type { AgreementContent } from '../types/agreement'

export type AgreementPdfInput = Pick<Agreement, 'title' | 'signed_content' | 'founder_signed_at' | 'client_signed_at' | 'founder_user_id' | 'client_user_id'> & {
  founderName: string
  clientName: string
  logo?: Uint8Array
}

const encoder = new TextEncoder()
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2
const CONTENT_BOTTOM = 52
const encoderSafe = (value: string) => value
  .replace(/\u20b9/g, 'INR ')
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/\u2026/g, '...')
  .replace(/[^\x20-\x7e]/g, '?')
  .replace(/[\\()]/g, '\\$&')

function wrap(value: string, size: number, width = CONTENT_WIDTH): string[] {
  const maxChars = Math.max(16, Math.floor(width / (size * 0.52)))
  const result: string[] = []
  for (const paragraph of value.split(/\r?\n/)) {
    if (!paragraph.trim()) { result.push(''); continue }
    let line = ''
    for (const originalWord of paragraph.trim().split(/\s+/)) {
      const chunks = originalWord.length > maxChars
        ? originalWord.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [originalWord]
        : [originalWord]
      for (const word of chunks) {
        if (line && `${line} ${word}`.length > maxChars) { result.push(line); line = word }
        else line = line ? `${line} ${word}` : word
      }
    }
    if (line) result.push(line)
  }
  return result
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
  return output
}

function streamObject(dictionary: string, stream: Uint8Array): Uint8Array {
  return concat([encoder.encode(`<< ${dictionary} /Length ${stream.length} >>\nstream\n`), stream, encoder.encode('\nendstream')])
}

function pngRgb(data: Uint8Array) {
  if (data.length < 33 || data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  const depth = data[24] as number
  const colorType = data[25] as number
  if (!width || !height || depth !== 8 || colorType !== 2) return null
  const chunks: Uint8Array[] = []
  let offset = 8
  while (offset + 12 <= data.length) {
    const length = view.getUint32(offset)
    const tag = String.fromCharCode(...data.subarray(offset + 4, offset + 8))
    if (tag === 'IDAT') chunks.push(data.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
    if (tag === 'IEND') break
  }
  if (!chunks.length) return null
  return { width, height, compressed: concat(chunks) }
}

/** Build a paginated A4 PDF with 16.9 mm margins and flow-through clauses. */
export function buildAgreementPdf(input: AgreementPdfInput): Uint8Array {
  const content = input.signed_content
  if (!content) throw new Error('Agreement content is required to generate the PDF.')

  const pages: string[] = []
  let stream = ''
  let y = 745
  const startPage = () => {
    stream = '0.84 g 48 785 499 0.7 re f 0 g\n'
      + 'BT /F2 9 Tf 420 794 Td (VERNEX DIGITAL MARKETING) Tj ET\n'
      + 'BT /F1 8 Tf 420 780 Td (+91 9789912805  |  www.vernex.in) Tj ET\n'
    if (input.logo?.length) stream += 'q 72 0 0 54 48 766 cm /Logo Do Q\n'
    stream += '0.7 w 48 756 m 547 756 l S\n'
    y = 738
  }
  const finishPage = () => pages.push(stream)
  const newPage = () => { finishPage(); startPage() }
  const ensureRoom = (height: number) => { if (y - height < CONTENT_BOTTOM) newPage() }
  const drawLine = (line: string, size: number, indent: number, bold: boolean) => {
    if (y - size - 4 < CONTENT_BOTTOM) newPage()
    stream += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${MARGIN_X + indent} ${y} Td (${encoderSafe(line)}) Tj ET\n`
    y -= size + 4
  }
  const drawText = (value: string, size = 10, indent = 0, bold = false, width = CONTENT_WIDTH - indent) => {
    for (const line of wrap(value, size, width)) drawLine(line, size, indent, bold)
  }
  const section = (label: string, value: string) => {
    if (!value.trim()) return
    ensureRoom(34)
    drawText(label, 11, 0, true)
    drawText(value, 10, 10)
    y -= 5
  }

  startPage()
  drawText('DEVELOPER ENGAGEMENT & NON-OWNERSHIP AGREEMENT', 12, 0, true)
  drawText(input.title, 15, 0, true)
  drawText(content.projectTitle, 11, 0, true)
  drawText(`Agreement date: ${content.agreementDate}`, 10)
  drawText(`Client: ${content.clientName}${content.clientEmail ? ` (${content.clientEmail})` : ''}`, 10)
  y -= 4
  drawText(`This Agreement is made on this ${content.agreementDate}, at Chennai, India, by and between:`, 9.5)
  drawText(`${content.companyName}, represented by Mr. ${content.companySigner}, ${content.companyTitle}, hereinafter referred to as the "Company" (which includes its successors and assigns),`, 9.5, 10)
  drawText('AND', 9.5, 0, true)
  drawText(`${content.clientName || content.developerName}, hereinafter referred to as the "Developer" (which expression shall include his heirs, legal representatives, and permitted assigns).`, 9.5, 10)
  y -= 4
  section('SERVICES', content.services)
  section('SCOPE OF WORK', content.scope)
  section('PAYMENT TERMS', content.paymentTerms)
  section('TERM DATES', [content.startDate && `Start: ${content.startDate}`, content.endDate && `End: ${content.endDate}`].filter(Boolean).join('  |  '))
  drawText('TERMS AND CONDITIONS', 12, 0, true)
  y -= 3

  for (const clause of content.clauses) {
    const body = clause.body.replace(/{{projectTitle}}/g, content.projectTitle)
      .replace(/{{developerName}}/g, content.developerName)
      .replace(/{{companyName}}/g, content.companyName)
      .replace(/{{companySigner}}/g, content.companySigner)
    const titleLines = wrap(`${clause.number}. ${clause.title}`, 11)
    const firstBodyLine = wrap(body, 10)[0] ?? ''
    ensureRoom((titleLines.length + (firstBodyLine ? 1 : 0)) * 14 + 8)
    for (const line of titleLines) drawLine(line, 11, 0, true)
    drawText(body, 10, 10)
    y -= 7
  }

  finishPage()

  const objects: Uint8Array[] = []
  const add = (body: string | Uint8Array) => { objects.push(typeof body === 'string' ? encoder.encode(body) : body); return objects.length }
  const catalogId = add('')
  const pagesId = add('')
  const regularFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const boldFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  const logoInfo = input.logo ? pngRgb(input.logo) : null
  const logoId = logoInfo
    ? add(streamObject(`/Type /XObject /Subtype /Image /Width ${logoInfo.width} /Height ${logoInfo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${logoInfo.width} >>`, logoInfo.compressed))
    : null
  const pageRefs: number[] = []
  const totalPages = pages.length
  pages.forEach((page, index) => {
    const pageStream = `${page}BT /F1 8 Tf 268 27 Td (Page ${index + 1} of ${totalPages}) Tj ET\n`
    const contentId = add(streamObject('', encoder.encode(pageStream)))
    const images = [logoId && `/Logo ${logoId} 0 R`].filter(Boolean).join(' ')
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> /XObject << ${images} >> >> /Contents ${contentId} 0 R >>`)
    pageRefs.push(pageId)
  })
  objects[catalogId - 1] = encoder.encode(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  objects[pagesId - 1] = encoder.encode(`<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map((id) => `${id} 0 R`).join(' ')}] >>`)
  const header = encoder.encode('%PDF-1.4\n%Vernex A4 agreement\n')
  const chunks: Uint8Array[] = [header]
  const offsets = [0]
  let offset = header.length
  objects.forEach((body, index) => {
    offsets.push(offset)
    const object = concat([encoder.encode(`${index + 1} 0 obj\n`), body, encoder.encode('\nendobj\n')])
    chunks.push(object)
    offset += object.length
  })
  const xrefOffset = offset
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.slice(1).map((item) => `${String(item).padStart(10, '0')} 00000 n \n`)].join('')
  chunks.push(encoder.encode(xref))
  chunks.push(encoder.encode(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`))
  return concat(chunks)

}

export function agreementContentForSnapshot(content: AgreementContent): AgreementContent {
  return structuredClone(content)
}
