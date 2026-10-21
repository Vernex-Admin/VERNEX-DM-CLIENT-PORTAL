type Props = {
  clientName: string
  clientSignatureUrl?: string | null
  clientSignedAt?: string | null
  clientTimeZone?: string | null
  formatClientTime?: (value: string | null, zone: string | null) => string
}

export function AgreementClosingPagePreview({ clientName, clientSignatureUrl, clientSignedAt, clientTimeZone, formatClientTime }: Props) {
  const timestamp = clientSignedAt && clientTimeZone && formatClientTime
    ? `Client signed at: ${formatClientTime(clientSignedAt, clientTimeZone)}`
    : ''

  return (
    <article className="agreement-closing-page" aria-label="Vernex agreement closing and signature page">
      <img className="agreement-closing-art" src="/vernex-agreement-closing-page.png" alt="Vernex agreement closing page template" />
      <img className="agreement-closing-client-signature" src={clientSignatureUrl || undefined} alt={clientSignatureUrl ? 'Client signature' : ''} />
      <span className={`agreement-closing-client-name${clientName.length > 28 ? ' long' : ''}`}>{clientName}</span>
      {timestamp && <>
        <span className="agreement-closing-time founder-time">{timestamp}</span>
        <span className="agreement-closing-time client-time">{timestamp}</span>
      </>}
    </article>
  )
}
