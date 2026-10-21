import { DEFAULT_LOGO_URL, DEFAULT_QR_URL, documentImagePaths } from '../../lib/invoiceDocument'
import { useInvoiceImageUrls } from '../../lib/queries'
import type { ImageRef, InvoiceDocument } from '../../types/invoiceDocument'

function resolve(image: ImageRef, urls: Record<string, string> | undefined, builtIn: string): string | null {
  if (image.kind === 'default') return builtIn
  if (image.kind === 'uploaded') return urls?.[image.path] ?? null
  return null
}

/** The logo and QR URLs to show for a document: built-in artwork, a signed upload link, or none. */
export function useInvoiceImages(document: InvoiceDocument | null | undefined) {
  const urls = useInvoiceImageUrls(document ? documentImagePaths(document) : [])
  if (!document) return { logo: null, qr: null }
  return {
    logo: resolve(document.company.logo, urls.data, DEFAULT_LOGO_URL),
    qr: resolve(document.payment.qr, urls.data, DEFAULT_QR_URL),
  }
}

/** "Invoice-VX-26-27-0049": a file name for the invoice's PDF. */
export function invoiceFileName(number: string) {
  return number ? `Invoice-${number.replace(/[^A-Za-z0-9-]+/g, '-')}` : 'Invoice'
}
