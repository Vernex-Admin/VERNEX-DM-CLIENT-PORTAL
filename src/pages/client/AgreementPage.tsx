import { useState } from 'react'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { SignaturePad } from '../../components/SignaturePad'
import { AgreementClosingPagePreview } from '../../components/AgreementClosingPagePreview'
import { Button, Card, CardBody, Pill, useToast } from '../../components/ui'
import { useAgreement, useAgreementEvents, useClientSignAgreement, useGenerateFinalAgreementPdf } from '../../lib/queries'
import type { AgreementStatus } from '../../types/agreement'
import { currentIanaTimeZone, formatClientSignedAt } from '../../lib/agreementTime'

const labels: Record<AgreementStatus, string> = {
  draft: 'Draft',
  awaiting_founder_signature: 'Awaiting Founder Signature',
  awaiting_client_signature: 'Awaiting Your Signature',
  signed: 'Signed',
  cancelled: 'Cancelled',
}

function localTime(value: string | null) {
  if (!value) return 'Not signed'
  const date = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short',
  }).format(new Date(value))
  return `${date} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
}

export default function ClientAgreementPage() {
  const { id } = useParams()
  const agreement = useAgreement(id)
  const events = useAgreementEvents(id)
  const sign = useClientSignAgreement()
  const generatePdf = useGenerateFinalAgreementPdf()
  const toast = useToast()
  const [signature, setSignature] = useState<Blob | null>(null)
  const [consent, setConsent] = useState(false)

  async function submitSignature() {
    if (!id || !signature || !consent) return
    try {
      const timeZone = currentIanaTimeZone()
      await sign.mutateAsync({ id, signature, consent, timeZone })
      toast({ title: 'Your signature was recorded', tone: 'ok' })
      try {
        await generatePdf.mutateAsync(id)
      } catch {
        toast({ title: 'Signed successfully. The final PDF is still processing; retry its download below.', tone: 'bad' })
      }
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'Could not record your signature', tone: 'bad' })
    }
  }

  if (agreement.isPending) return <p role="status">Loading agreement…</p>
  if (agreement.isError || !agreement.data) return <p role="alert">This agreement is unavailable.</p>
  const row = agreement.data
  const content = row.signed_content ?? row.content
  const canSign = row.status === 'awaiting_client_signature'

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link to="/vault" className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink">
        <Icon icon={ArrowLeft} size={15} /> Back to Vault
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{row.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">Review the full agreement and both parties’ signing history.</p>
        </div>
        <Pill tone={row.status === 'signed' ? 'ok' : row.status === 'cancelled' ? 'neutral' : 'info'}>{labels[row.status]}</Pill>
      </header>

      <Card>
        <CardBody className="flex flex-col gap-4 p-5">
          <div className="grid gap-2 border-b border-rule pb-4 text-sm sm:grid-cols-2">
            <p><b>Client:</b> {content.clientName}{content.clientEmail ? ` · ${content.clientEmail}` : ''}</p>
            <p><b>Project:</b> {content.projectTitle}</p>
            <p><b>Services:</b> {content.services || '—'}</p>
            <p><b>Agreement date:</b> {content.agreementDate || '—'}</p>
            <p><b>Scope:</b> {content.scope || '—'}</p>
            <p><b>Payment terms:</b> {content.paymentTerms || '—'}</p>
            <p><b>Term:</b> {[content.startDate, content.endDate].filter(Boolean).join(' to ') || '—'}</p>
          </div>
          <h2 className="text-lg">Terms and conditions</h2>
          {content.clauses.map((clause) => (
            <section key={clause.id} className="flex flex-col gap-1 border-b border-rule pb-3 last:border-0">
              <h3 className="font-semibold">{clause.number}. {clause.title}</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                {clause.body.replace(/{{projectTitle}}/g, content.projectTitle).replace(/{{developerName}}/g, content.developerName)}
              </p>
            </section>
          ))}
        </CardBody>
      </Card>

      <section className="client-agreement-closing" aria-label="Agreement final signature page">
        <AgreementClosingPagePreview
          clientName={content.clientName || 'Client signer'}
          clientSignatureUrl={row.client_signature_url}
          clientSignedAt={row.client_signed_at}
          clientTimeZone={row.client_timezone}
          formatClientTime={formatClientSignedAt}
        />
      </section>

      <Card>
        <CardBody className="flex flex-col gap-4 p-5">
          <h2 className="text-lg">Signatures and timestamps</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-card border border-rule p-3">
              <b>Founder</b>
              {row.founder_signature_url && <img src={row.founder_signature_url} alt="Founder signature" className="h-20 w-full object-contain object-left" />}
              <span>{content.companySigner}, {content.companyTitle}</span>
              <span className="text-xs text-ink-muted">Founder approved at: {localTime(row.founder_signed_at)}</span>
              <span className="text-xs text-ink-muted">Client signed at: {formatClientSignedAt(row.client_signed_at, row.client_timezone)}</span>
            </div>
            <div className="flex flex-col gap-2 rounded-card border border-rule p-3">
              <b>Client</b>
              {row.client_signature_url && <img src={row.client_signature_url} alt="Client signature" className="h-20 w-full object-contain object-left" />}
              <span>{content.clientName || 'Client signer'}</span>
              <span className="text-xs text-ink-muted">Client signed at: {formatClientSignedAt(row.client_signed_at, row.client_timezone)}</span>
            </div>
          </div>

          {canSign && (
            <div className="flex flex-col gap-3 border-t border-rule pt-4">
              <h3 className="font-semibold">Sign this agreement</h3>
              <SignaturePad label="Client signature pad" onSave={setSignature} disabled={sign.isPending} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
                <span>I have reviewed this agreement and consent to sign it electronically. I understand this submits my signature for this agreement.</span>
              </label>
              <Button variant="primary" disabled={!signature || !consent} loading={sign.isPending} onClick={submitSignature}>
                Sign Agreement
              </Button>
            </div>
          )}

          {row.status === 'signed' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-4">
              {row.signed_pdf_url ? (
                <a href={row.signed_pdf_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-card bg-signal px-3 text-sm font-semibold text-white">
                  <Icon icon={Download} size={15} /> Download signed PDF
                </a>
              ) : (
                <Button variant="secondary" loading={generatePdf.isPending} onClick={() => generatePdf.mutate(id as string)} className="gap-2">
                  <Icon icon={FileText} size={15} /> Generate signed PDF
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-5">
          <h2 className="mb-3 text-lg">Agreement history</h2>
          {events.isError ? <p role="alert">Could not load signing history.</p> : (
            <ol className="flex flex-col gap-2 text-sm text-ink-muted">
              {(events.data ?? []).map((event) => (
                <li key={event.id}>{event.event_type.replaceAll('_', ' ')} · {event.event_type === 'client_signed'
                  ? formatClientSignedAt(event.created_at, row.client_timezone)
                  : localTime(event.created_at)}</li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </main>
  )
}
