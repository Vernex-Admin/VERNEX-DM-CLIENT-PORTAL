import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Ban, FileText, Plus, Printer, Save, Send, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { PDFDocument } from 'pdf-lib'
import { Icon } from '../../../components/Icon'
import { Button, Card, CardBody, Field, Input, Select, useToast } from '../../../components/ui'
import { useSessionProfile } from '../../../lib/session-context'
import {
  useAgreementTemplates, useAgreements, useCancelAgreement, useClient, useClients,
  useAgreementEvents, useCreateAgreementDraft, useFounderSignAndSend, useGenerateFinalAgreementPdf, useRequestFounderSignature,
  useSaveAgreementTemplate, useUpdateAgreementDraft,
} from '../../../lib/queries'
import type { Agreement } from '../../../types/db'
import type { AgreementContent } from '../../../types/agreement'
import { formatClientSignedAt } from '../../../lib/agreementTime'
import { appendClosingPage, CLOSING_PAGE_URL } from '../../../lib/agreementClosingPage'
import { buildAgreementPdf } from '../../../lib/agreementPdf'

export type Clause = {
  id: string
  number: number
  title: string
  body: string
}

const agreementStatusLabel = (status: string) => ({
  draft: 'Draft',
  awaiting_founder_signature: 'Awaiting Founder Signature',
  awaiting_client_signature: 'Awaiting Client Signature',
  signed: 'Signed',
  cancelled: 'Cancelled',
}[status] ?? status)

const agreementEventLabel = (event: string) => ({
  created: 'Draft created',
  edited: 'Draft edited',
  submitted_for_founder_signature: 'Submitted for founder signature',
  founder_signed_and_sent: 'Founder signed and sent to client',
  client_signed: 'Client signed',
  cancelled: 'Agreement cancelled',
  signed_pdf_generated: 'Final PDF generated',
}[event] ?? event)

function formatLocalTimestamp(value: string) {
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' }).format(new Date(value))} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
}

function Timestamp({ label, value }: { label: string; value: string | null }) {
  return <span className="text-xs text-ink-muted">{label}: {value ? formatLocalTimestamp(value) : 'Not signed'}</span>
}

const DEFAULT_CLAUSES: Clause[] = [
  {
    id: 'c1',
    number: 1,
    title: 'Scope of Engagement',
    body: 'The Developer is engaged for the development of the project titled "{{projectTitle}}". The scope of work includes UI/UX design, frontend development, and backend tasks as assigned by the Company. The Developer shall perform all assigned tasks in accordance with the Company\'s instructions, timelines, and quality standards.',
  },
  {
    id: 'c2',
    number: 2,
    title: 'Term',
    body: 'This Agreement shall commence on the date of execution and shall continue until completion of the assigned work unless terminated earlier as per this Agreement.',
  },
  {
    id: 'c3',
    number: 3,
    title: 'Compensation',
    body: 'The Company shall release payment to the Developer only when the product is finalized and ready for sale or commercialization. The Developer shall be paid a fixed amount of ₹8,000 (Rupees Eight Thousand Only). Upon satisfactory and timely completion, the Company may, at its sole discretion, provide an additional bonus amount, making the total payment up to ₹10,000 (Rupees Ten Thousand Only). This shall be full and final compensation.',
  },
  {
    id: 'c4',
    number: 4,
    title: 'Ownership and Intellectual Property',
    body: 'All work created under this Agreement shall be treated as “work made for hire”. The Developer irrevocably assigns all rights, title, and interest in the work to the Company. This includes source code, UI/UX designs, databases, architecture, and all related assets. The Developer shall have no ownership or claim over the project or any part of it.',
  },
  {
    id: 'c5',
    number: 5,
    title: 'No Royalty or Future Claims',
    body: 'The Developer shall not be entitled to any royalty, revenue share, equity, or future financial benefit from the project. The agreed compensation is full and final settlement.',
  },
  {
    id: 'c6',
    number: 6,
    title: 'Authority and Reporting',
    body: 'The Developer shall work under the direct authority of Mr. BOSS ANANDAA, CEO & Founder of VerneX. The Company has full rights to assign tasks, modify responsibilities, and designate roles such as Database Manager or other technical authorities.',
  },
  {
    id: 'c7',
    number: 7,
    title: 'Confidentiality',
    body: 'The Developer shall maintain strict confidentiality of all project-related information, including code, designs, data, and internal processes. This obligation continues even after termination of this Agreement.',
  },
  {
    id: 'c8',
    number: 8,
    title: 'Non-Compete and Non-Misuse',
    body: 'The Developer shall not reuse, copy, distribute, or claim ownership of any part of the project. The Developer shall not engage in any activity that may harm the Company’s interests.',
  },
  {
    id: 'c9',
    number: 9,
    title: 'Termination',
    body: 'The Company may terminate this Agreement in case of breach, delay, misconduct, or failure. Upon termination, the Developer must hand over all work completed. No further payment shall be made for incomplete or unsatisfactory work.',
  },
  {
    id: 'c10',
    number: 10,
    title: 'Breach and Legal Action',
    body: 'Any violation of this Agreement shall be treated as a material breach. The Company reserves the right to take legal action, including claiming damages and seeking injunctions.',
  },
  {
    id: 'c11',
    number: 11,
    title: 'Independent Contractor',
    body: 'The Developer is an independent contractor. This Agreement does not create any partnership, employment, or ownership relationship.',
  },
  {
    id: 'c12',
    number: 12,
    title: 'Governing Law and Jurisdiction',
    body: 'This Agreement shall be governed by the laws of India. Any disputes shall be subject to the jurisdiction of the courts in Chennai, Tamil Nadu.',
  },
  {
    id: 'c13',
    number: 13,
    title: 'Entire Agreement',
    body: 'This document constitutes the entire agreement between the parties and supersedes all prior discussions or understandings.',
  },
]

export default function AgreementPage() {
  const { id: paramClientId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const clientId = paramClientId ?? params.get('client') ?? ''
  const profile = useSessionProfile()
  const clients = useClients()
  const templates = useAgreementTemplates()
  const agreements = useAgreements(clientId || undefined)
  const createDraft = useCreateAgreementDraft()
  const updateDraft = useUpdateAgreementDraft()
  const requestSignature = useRequestFounderSignature()
  const founderSign = useFounderSignAndSend()
  const cancelAgreement = useCancelAgreement()
  const saveTemplate = useSaveAgreementTemplate()
  const generatePdf = useGenerateFinalAgreementPdf()

  const clientQuery = useClient(clientId || undefined)
  const client = clientQuery.data

  // Form state
  const [projectTitle, setProjectTitle] = useState(
    () => params.get('title') || (client ? `${client.name.toUpperCase()} PROJECT` : 'VNX - SCHOOL ERP PROJECT'),
  )
  const [agreementDate, setAgreementDate] = useState(() => {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  })
  const [developerName, setDeveloperName] = useState('Haran')
  const [companySigner, setCompanySigner] = useState('BOSS ANANDAA')
  const [companyTitle, setCompanyTitle] = useState('CEO & Founder')
  const [companyName, setCompanyName] = useState('VerneX')
  const [clauses, setClauses] = useState<Clause[]>(DEFAULT_CLAUSES)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [services, setServices] = useState('')
  const [scope, setScope] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [templateName, setTemplateName] = useState('Vernex Services Agreement')
  const [selectedAgreementId, setSelectedAgreementId] = useState('')
  const [zoomMode, setZoomMode] = useState<'fit-page' | '75' | '100' | 'fit-width'>('fit-page')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewPageCount, setPreviewPageCount] = useState(1)
  const [previewAtClosingPage, setPreviewAtClosingPage] = useState(false)

  const selectedAgreement = agreements.data?.find((row) => row.id === selectedAgreementId)
  const agreementEvents = useAgreementEvents(selectedAgreementId || undefined)
  const isFounder = profile?.role === 'vernex_founder'
  const editable = !selectedAgreement || selectedAgreement.status === 'draft'

  function agreementContent(): AgreementContent {
    return {
      projectTitle, agreementDate, startDate, endDate, clientName, clientEmail, services, scope,
      paymentTerms, developerName, companyName, companySigner, companyTitle,
      clauses: structuredClone(clauses),
    }
  }

  function loadAgreement(agreement: Agreement) {
    setSelectedAgreementId(agreement.id)
    setTemplateId(agreement.template_id ?? '')
    setProjectTitle(agreement.content.projectTitle)
    setAgreementDate(agreement.content.agreementDate)
    setStartDate(agreement.content.startDate)
    setEndDate(agreement.content.endDate)
    setClientName(agreement.content.clientName)
    setClientEmail(agreement.content.clientEmail)
    setServices(agreement.content.services)
    setScope(agreement.content.scope)
    setPaymentTerms(agreement.content.paymentTerms)
    setDeveloperName(agreement.content.developerName)
    setCompanyName(agreement.content.companyName)
    setCompanySigner(agreement.content.companySigner)
    setCompanyTitle(agreement.content.companyTitle)
    setClauses(agreement.content.clauses)
  }

  function handleAddClause() {
    const nextNum = clauses.length + 1
    const newClause: Clause = {
      id: `c_${Date.now()}`,
      number: nextNum,
      title: `Clause ${nextNum}`,
      body: 'Description and terms for this clause.',
    }
    setClauses([...clauses, newClause])
  }

  function handleUpdateClause(index: number, patch: Partial<Clause>) {
    setClauses(clauses.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  function handleDeleteClause(index: number) {
    const next = clauses.filter((_, i) => i !== index).map((c, i) => ({ ...c, number: i + 1 }))
    setClauses(next)
  }

  const previewContentJson = JSON.stringify(agreementContent())

  useEffect(() => {
    let cancelled = false
    let nextUrl: string | null = null

    const createPreview = async () => {
      try {
        const content = JSON.parse(previewContentJson) as AgreementContent
        const [logoResponse, closingResponse] = await Promise.all([
          fetch('/vernex-digital-marketing.png'),
          fetch(CLOSING_PAGE_URL),
        ])
        if (!closingResponse.ok) throw new Error('The fixed closing page template is unavailable.')
        const logo = logoResponse.ok ? new Uint8Array(await logoResponse.arrayBuffer()) : undefined
        const basePdf = buildAgreementPdf({
          title: `${content.projectTitle || 'Services'} Agreement`,
          signed_content: content,
          founder_signed_at: selectedAgreement?.founder_signed_at ?? null,
          client_signed_at: selectedAgreement?.client_signed_at ?? null,
          founder_user_id: selectedAgreement?.founder_user_id ?? null,
          client_user_id: selectedAgreement?.client_user_id ?? null,
          founderName: content.companySigner,
          clientName: content.clientName,
          logo,
        })
        const agreementPages = await PDFDocument.load(basePdf)
        const isSigned = selectedAgreement?.status === 'signed'
        let signature: Uint8Array | undefined
        if (isSigned && selectedAgreement?.client_signature_url) {
          try {
            const response = await fetch(selectedAgreement.client_signature_url)
            if (response.ok) signature = new Uint8Array(await response.arrayBuffer())
          } catch { /* Preview remains available if a private signature URL expires. */ }
        }
        const pdf = await appendClosingPage(basePdf, new Uint8Array(await closingResponse.arrayBuffer()), {
          name: isSigned ? (selectedAgreement?.signed_content?.clientName || content.clientName || 'Client signer') : (content.clientName || 'Client signer'),
          signature,
          signedAt: isSigned ? selectedAgreement?.client_signed_at : null,
          timeZone: isSigned ? selectedAgreement?.client_timezone : null,
        })
        const pdfBuffer = new ArrayBuffer(pdf.byteLength)
        new Uint8Array(pdfBuffer).set(pdf)
        nextUrl = URL.createObjectURL(new Blob([pdfBuffer], { type: 'application/pdf' }))
        if (cancelled) { URL.revokeObjectURL(nextUrl); return }
        setPreviewPageCount(agreementPages.getPageCount() + 1)
        setPreviewUrl((oldUrl) => {
          if (oldUrl) URL.revokeObjectURL(oldUrl)
          return nextUrl
        })
      } catch (error) {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : 'Could not prepare the A4 agreement preview.')
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    const timer = window.setTimeout(() => {
      setPreviewLoading(true)
      setPreviewError(null)
      void createPreview()
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (nextUrl) URL.revokeObjectURL(nextUrl)
    }
  }, [previewContentJson, selectedAgreement?.id, selectedAgreement?.status, selectedAgreement?.founder_signed_at,
    selectedAgreement?.client_signed_at, selectedAgreement?.founder_user_id, selectedAgreement?.client_user_id,
    selectedAgreement?.client_timezone, selectedAgreement?.client_signature_url, selectedAgreement?.signed_content])

  async function handleSaveAgreement(): Promise<string | null> {
    if (!clientId) {
      toast({ title: 'Select a client first to link this agreement', tone: 'bad' })
      return null
    }
    try {
      const title = `${projectTitle || 'Services'} Agreement`
      const agreement = selectedAgreementId
        ? await updateDraft.mutateAsync({ id: selectedAgreementId, title, content: agreementContent() }) as Agreement
        : await createDraft.mutateAsync({ client_id: clientId, template_id: templateId || null, title, content: agreementContent() }) as Agreement
      setSelectedAgreementId(agreement.id)
      toast({ title: 'Draft saved', tone: 'ok' })
      return agreement.id
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'Could not save agreement draft', tone: 'bad' })
      return null
    }
  }

  async function handleRequestSignature() {
    const id = await handleSaveAgreement()
    if (!id) return
    try {
      await requestSignature.mutateAsync(id)
      toast({ title: 'Sent to founder for review and signature', tone: 'ok' })
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'Could not submit agreement', tone: 'bad' })
    }
  }

  async function handleFounderSign() {
    if (!selectedAgreementId) return
    try {
      const signature = await fetch('/vernex-founder-signature.jpg').then((response) => {
        if (!response.ok) throw new Error('The embedded founder signature is unavailable.')
        return response.blob()
      })
      await founderSign.mutateAsync({ id: selectedAgreementId, signature })
      toast({ title: 'Founder approval recorded and agreement sent to the client', tone: 'ok' })
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'Founder signature could not be saved', tone: 'bad' })
    }
  }

  async function handleSaveTemplate() {
    try {
      const saved = await saveTemplate.mutateAsync({ name: templateName, content: agreementContent() })
      setTemplateId(saved.id)
      toast({ title: 'Agreement template saved', tone: 'ok' })
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'Template could not be saved', tone: 'bad' })
    }
  }

  function handlePrint() {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }

  function handleProceedToInvoice() {
    if (clientId) {
      navigate(`/admin/clients/${clientId}/invoice?title=${encodeURIComponent(projectTitle)}`)
    } else {
      navigate(`/admin/invoice?title=${encodeURIComponent(projectTitle)}`)
    }
  }

  return (
    <div className="agreement-editor flex min-h-[calc(100vh-5rem)] flex-col gap-3">
      {/* Top action header */}
      <div className="agreement-editor-toolbar sticky top-12 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-paper/95 py-2 backdrop-blur no-print">
        <div className="flex items-center gap-3">
          <Link
            to={clientId ? `/admin/clients/${clientId}` : '/admin/clients'}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-card border border-rule px-3 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            <Icon icon={ArrowLeft} size={15} />
            Back
          </Link>
          <div>
            <h1 className="text-[1.4rem] font-semibold leading-tight text-ink">Digital Agreement</h1>
            <p className="text-xs text-ink-muted">
              Draft, review, sign and send a client agreement.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={handlePrint} className="gap-1.5">
            <Icon icon={Printer} size={15} />
            Print / Save as PDF
          </Button>

          {editable && clientId && (
            <Button variant="secondary" onClick={handleSaveAgreement} loading={createDraft.isPending || updateDraft.isPending} className="gap-1.5">
              <Icon icon={Save} size={15} />
              Save Draft
            </Button>
          )}

          {editable && clientId && (
            <Button onClick={handleRequestSignature} loading={requestSignature.isPending} className="gap-1.5">
              <Icon icon={FileText} size={15} />
              Submit for Founder Signature
            </Button>
          )}

          {selectedAgreement?.status === 'signed' && selectedAgreement.signed_pdf_url && (
            <a href={selectedAgreement.signed_pdf_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-card border border-rule px-3 text-sm font-medium text-ink">
              <Icon icon={FileText} size={15} /> Download Signed PDF
            </a>
          )}

          <Button variant="primary" onClick={handleProceedToInvoice} className="gap-1.5">
            Proceed to Invoice
            <Icon icon={ArrowRight} size={15} />
          </Button>
        </div>
      </div>

      {/* Main split grid: Controls on left, Live Agreement Document on right */}
      <div className="agreement-editor-layout grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left Control Panel (col-span-5) */}
        <div className="agreement-editor-controls flex min-h-0 flex-col gap-3 lg:col-span-5 no-print">
          <Card>
            <CardBody className="flex flex-col gap-4 p-5">
              <h2 className="text-base font-semibold text-ink">Agreement Details</h2>

              <Field label="Reusable Template">
                <Select value={templateId} disabled={!editable} onChange={(event) => {
                  const id = event.target.value
                  setTemplateId(id)
                  const template = templates.data?.find((item) => item.id === id)
                  const content = template?.content
                  if (!content) return
                  setProjectTitle(content.projectTitle)
                  setAgreementDate(content.agreementDate)
                  setStartDate(content.startDate)
                  setEndDate(content.endDate)
                  setClientName(content.clientName)
                  setClientEmail(content.clientEmail)
                  setServices(content.services)
                  setScope(content.scope)
                  setPaymentTerms(content.paymentTerms)
                  setDeveloperName(content.developerName)
                  setCompanyName(content.companyName)
                  setCompanySigner(content.companySigner)
                  setCompanyTitle(content.companyTitle)
                  setClauses(content.clauses.length ? content.clauses : DEFAULT_CLAUSES)
                }}>
                  <option value="">Start from current agreement</option>
                  {(templates.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>

              {!clientId && (
                <Field label="Client">
                  <Select
                    value={clientId}
                    onChange={(e) => {
                      if (e.target.value) navigate(`/admin/clients/${e.target.value}/agreement`)
                    }}
                  >
                    <option value="">Select a client to link...</option>
                    {(clients.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Project Title">
                <Input
                  value={projectTitle}
                  disabled={!editable}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="e.g. VNX - SCHOOL ERP PROJECT"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Agreement Date">
                  <Input
                    value={agreementDate}
                    disabled={!editable}
                    onChange={(e) => setAgreementDate(e.target.value)}
                    placeholder="DD/MM/YYYY"
                  />
                </Field>

                <Field label="Client / signer name">
                  <Input
                    value={clientName}
                    disabled={!editable}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client signing contact"
                  />
                </Field>
              </div>

              <Field label="Client email">
                <Input value={clientEmail} disabled={!editable} type="email" onChange={(e) => setClientEmail(e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date"><Input value={startDate} disabled={!editable} type="date" onChange={(e) => setStartDate(e.target.value)} /></Field>
                <Field label="End date"><Input value={endDate} disabled={!editable} type="date" onChange={(e) => setEndDate(e.target.value)} /></Field>
              </div>

              <Field label="Services">
                <textarea className="w-full rounded-control border border-rule bg-surface p-2 text-sm" rows={2} disabled={!editable} value={services} onChange={(e) => setServices(e.target.value)} placeholder="Services included in this agreement" />
              </Field>
              <Field label="Scope of work">
                <textarea className="w-full rounded-control border border-rule bg-surface p-2 text-sm" rows={3} disabled={!editable} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Deliverables, responsibilities and exclusions" />
              </Field>
              <Field label="Payment terms">
                <textarea className="w-full rounded-control border border-rule bg-surface p-2 text-sm" rows={3} disabled={!editable} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Amount, currency, schedule, tax and late-payment terms" />
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Company Name">
                  <Input value={companyName} disabled={!editable} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="Signer Name">
                  <Input value={companySigner} disabled={!editable} onChange={(e) => setCompanySigner(e.target.value)} />
                </Field>
                <Field label="Signer Title">
                  <Input value={companyTitle} disabled={!editable} onChange={(e) => setCompanyTitle(e.target.value)} />
                </Field>
              </div>

              <div className="rounded-card border border-rule bg-paper/50 p-3.5">
                <Field label="Save reusable template as">
                  <Input disabled={!editable} value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
                </Field>
                <Button className="mt-3 gap-1.5" size="sm" variant="secondary" disabled={!editable || !templateName.trim()} loading={saveTemplate.isPending} onClick={handleSaveTemplate}>
                  <Icon icon={Save} size={14} /> Save as Template
                </Button>
              </div>

              {selectedAgreement && (
                <div className="rounded-card border border-rule p-3.5">
                  <p className="font-semibold text-ink">{selectedAgreement.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">Status: {agreementStatusLabel(selectedAgreement.status)}</p>
                  {selectedAgreement.status === 'awaiting_founder_signature' && isFounder && (
                    <div className="mt-3 flex flex-col gap-2">
                      <p className="text-sm text-ink-muted">Review the complete agreement. The signed Vernex closing page is included; your authenticated approval will record your identity and approval time before sending.</p>
                      <Button variant="primary" loading={founderSign.isPending} onClick={handleFounderSign} className="gap-2">
                        <Icon icon={Send} size={15} /> Approve &amp; Send to Client
                      </Button>
                    </div>
                  )}
                  {selectedAgreement.status === 'signed' && (
                    <div className="mt-3 flex flex-col gap-2 text-sm">
                      <Timestamp label="Founder signed" value={selectedAgreement.founder_signed_at} />
                      <span className="text-xs text-ink-muted">Client signed at: {formatClientSignedAt(selectedAgreement.client_signed_at, selectedAgreement.client_timezone)}</span>
                      {!selectedAgreement.signed_pdf_url && (
                        <Button size="sm" variant="secondary" loading={generatePdf.isPending} onClick={() => generatePdf.mutateAsync(selectedAgreement.id).then((url) => { window.open(url, '_blank', 'noopener,noreferrer') }).catch((error: unknown) => toast({ title: error instanceof Error ? error.message : 'Could not generate PDF', tone: 'bad' }))}>
                          Generate final signed PDF
                        </Button>
                      )}
                    </div>
                  )}
                  {['draft', 'awaiting_founder_signature', 'awaiting_client_signature'].includes(selectedAgreement.status) && (
                    <Button size="sm" variant="ghost" className="mt-3 gap-1.5 text-bad" loading={cancelAgreement.isPending} onClick={() => cancelAgreement.mutateAsync(selectedAgreement.id).then(() => toast({ title: 'Agreement cancelled', tone: 'ok' })).catch((error: unknown) => toast({ title: error instanceof Error ? error.message : 'Could not cancel agreement', tone: 'bad' }))}>
                      <Icon icon={Ban} size={14} /> Cancel Agreement
                    </Button>
                  )}
                  <div className="mt-4 border-t border-rule pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">History</p>
                    <ol className="flex flex-col gap-2 text-xs text-ink-muted">
                      {(agreementEvents.data ?? []).map((event) => (
                        <li key={event.id}>{agreementEventLabel(event.event_type)} &middot; {event.event_type === 'client_signed'
                          ? formatClientSignedAt(event.created_at, selectedAgreement?.client_timezone ?? null)
                          : formatLocalTimestamp(event.created_at)}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {agreements.data && agreements.data.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-ink">Agreement History</h3>
                  {agreements.data.map((agreement) => (
                    <button key={agreement.id} type="button" onClick={() => loadAgreement(agreement)} className={`rounded-card border px-3 py-2 text-left text-sm ${agreement.id === selectedAgreementId ? 'border-signal bg-surface' : 'border-rule bg-paper'}`}>
                      <span className="block truncate font-medium">{agreement.title}</span>
                      <span className="text-xs text-ink-muted">{agreementStatusLabel(agreement.status)} &middot; {formatLocalTimestamp(agreement.updated_at)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Clauses Editor Card */}
          <Card>
            <CardBody className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">Clauses &amp; Terms ({clauses.length})</h2>
                <Button size="sm" variant="ghost" onClick={handleAddClause} className="gap-1 text-xs">
                  <Icon icon={Plus} size={14} />
                  Add Clause
                </Button>
              </div>

              <div className="flex max-h-[500px] flex-col gap-3 overflow-y-auto pr-1">
                {clauses.map((clause, index) => (
                  <div key={clause.id} className="rounded-card border border-rule bg-paper/40 p-3 text-xs">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {clause.number}. {clause.title}
                      </span>
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => handleDeleteClause(index)}
                        className="text-ink-muted hover:text-bad"
                        title="Delete clause"
                      >
                        <Icon icon={Trash2} size={13} />
                      </button>
                    </div>
                    <Input
                      className="mb-1.5 text-xs font-medium"
                      value={clause.title}
                      disabled={!editable}
                      onChange={(e) => handleUpdateClause(index, { title: e.target.value })}
                      placeholder="Clause Title"
                    />
                    <textarea
                      rows={3}
                      className="w-full rounded-control border border-rule bg-surface p-2 text-xs leading-relaxed text-ink focus:border-signal focus:outline-none"
                      value={clause.body}
                      disabled={!editable}
                      onChange={(e) => handleUpdateClause(index, { body: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <section className="agreement-preview lg:col-span-7" aria-label="Agreement preview">
          <div className="agreement-zoom-toolbar no-print">
            <span className="text-xs font-medium text-ink-muted">Preview zoom</span>
            <button type="button" aria-pressed={previewAtClosingPage} disabled={!previewUrl}
              onClick={() => setPreviewAtClosingPage((current) => !current)}
              className={previewAtClosingPage ? 'agreement-zoom-button active' : 'agreement-zoom-button'}>
              {previewAtClosingPage ? 'Back to agreement' : `View final template · page ${previewPageCount}`}
            </button>
            {([
              ['fit-page', 'Fit Page'], ['75', '75%'], ['100', '100%'], ['fit-width', 'Fit Width'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={zoomMode === value}
                onClick={() => setZoomMode(value)} className={zoomMode === value ? 'agreement-zoom-button active' : 'agreement-zoom-button'}>
                {label}
              </button>
            ))}
          </div>
          <div className="agreement-preview-viewport">
            {previewLoading && <div className="agreement-preview-message">Preparing A4 preview…</div>}
            {previewError && <div role="alert" className="agreement-preview-message error">{previewError}</div>}
            {previewUrl && <iframe
              key={`${previewUrl}-${zoomMode}`}
              title="Paginated A4 agreement preview"
              className="agreement-preview-pdf-frame"
              src={`${previewUrl}#toolbar=0&navpanes=0&page=${previewAtClosingPage ? previewPageCount : 1}&zoom=${zoomMode === 'fit-page' ? 'page-fit' : zoomMode === 'fit-width' ? 'page-width' : zoomMode}`}
            />}
          </div>
        </section>
      </div>
    </div>
  )
}
