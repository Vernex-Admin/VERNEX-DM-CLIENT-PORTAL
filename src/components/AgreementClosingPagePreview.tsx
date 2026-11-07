type Props = {
  clientName: string
  clientSignatureUrl?: string | null
  clientSignedAt?: string | null
  clientTimeZone?: string | null
  founderSignedAt?: string | null
  formatClientTime?: (value: string | null, zone: string | null) => string
}

const shortDate = (value: string, timeZone: string | null | undefined) => {
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timeZone || 'Asia/Kolkata' }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value))
  }
}

/**
 * The fixed last page, the same for every client. Nothing is written on it until the client has
 * signed; then the signature, name and dates sit on its lines, as in the signed PDF
 * (src/lib/agreementClosingPage.ts).
 */
export function AgreementClosingPagePreview({ clientName, clientSignatureUrl, clientSignedAt, clientTimeZone, founderSignedAt, formatClientTime }: Props) {
  const signed = Boolean(clientSignedAt)
  const timestamp = clientSignedAt && clientTimeZone && formatClientTime
    ? `Client signed at: ${formatClientTime(clientSignedAt, clientTimeZone)}`
    : ''

  return (
    <article className="agreement-closing-page" aria-label="Vernex agreement closing and signature page">
      <img className="agreement-closing-art" src="/vernex-agreement-closing-page.png" alt="Vernex agreement closing page template" />
      {signed && clientSignatureUrl && <img className="agreement-closing-client-signature" src={clientSignatureUrl} alt="Client signature" />}
      {signed && clientName.trim() && (
        <span className={`agreement-closing-client-name${clientName.length > 28 ? ' long' : ''}`}>{clientName}</span>
      )}
      {signed && clientSignedAt && <span className="agreement-closing-date client-date">{shortDate(clientSignedAt, clientTimeZone)}</span>}
      {signed && founderSignedAt && <span className="agreement-closing-date founder-date">{shortDate(founderSignedAt, 'Asia/Kolkata')}</span>}
      {timestamp && <>
        <span className="agreement-closing-time founder-time">{timestamp}</span>
        <span className="agreement-closing-time client-time">{timestamp}</span>
      </>}
    </article>
  )
}
