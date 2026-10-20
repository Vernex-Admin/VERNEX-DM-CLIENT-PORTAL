import { useState, useRef, useMemo } from 'react'
import { ArrowLeft, ArrowRight, FileText, Image as ImageIcon, Plus, Printer, Trash2, Upload } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Icon } from '../../../components/Icon'
import { Button, Card, CardBody, Field, Input, Select, useToast } from '../../../components/ui'
import { useClient, useClients, useCreateDocument } from '../../../lib/queries'

export type Clause = {
  id: string
  number: number
  title: string
  body: string
}

const DEFAULT_CLAUSES: Clause[] = [
  {
    id: 'c1',
    number: 1,
    title: 'Scope of Engagement',
    body: 'The Developer is engaged for the development of the project titled “{{projectTitle}}”. The scope of work includes UI/UX design, frontend development, and backend tasks as assigned by the Company. The Developer shall perform all assigned tasks in accordance with the Company’s instructions, timelines, and quality standards.',
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
  const createDocument = useCreateDocument()
  const clients = useClients()

  const clientId = paramClientId ?? params.get('client') ?? ''
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
  const [devSignature, setDevSignature] = useState<string | null>(null)

  // Pagination threshold: clauses per page (first page has title/preamble, so fewer clauses)
  const [page1ClauseCount, setPage1ClauseCount] = useState(4)
  const [page2ClauseCount, setPage2ClauseCount] = useState(7)

  const signatureInputRef = useRef<HTMLInputElement>(null)

  function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setDevSignature(reader.result as string)
      toast({ title: 'Signature uploaded successfully', tone: 'ok' })
    }
    reader.readAsDataURL(file)
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

  // Automatic multi-page segmentation
  const pages = useMemo(() => {
    const page1 = clauses.slice(0, page1ClauseCount)
    const page2 = clauses.slice(page1ClauseCount, page1ClauseCount + page2ClauseCount)
    const page3 = clauses.slice(page1ClauseCount + page2ClauseCount)

    return [
      { pageNumber: 1, isFirst: true, isLast: false, clauses: page1 },
      ...(page2.length > 0 ? [{ pageNumber: 2, isFirst: false, isLast: page3.length === 0, clauses: page2 }] : []),
      ...(page3.length > 0 ? [{ pageNumber: 3, isFirst: false, isLast: true, clauses: page3 }] : []),
    ]
  }, [clauses, page1ClauseCount, page2ClauseCount])

  async function handleSaveAgreement() {
    if (!clientId) {
      toast({ title: 'Select a client first to link this agreement', tone: 'bad' })
      return
    }
    try {
      await createDocument.mutateAsync({
        client_id: clientId,
        kind: 'agreement',
        title: `${projectTitle} - Developer Agreement`,
        external_url: null,
        status: devSignature ? 'signed' : 'draft',
        sent_at: new Date().toISOString(),
        signed_at: devSignature ? new Date().toISOString() : null,
      })
      toast({ title: 'Agreement saved to client documents', tone: 'ok' })
    } catch {
      toast({ title: 'Could not save agreement document', tone: 'bad' })
    }
  }

  function handlePrint() {
    window.print()
  }

  function handleProceedToInvoice() {
    if (clientId) {
      navigate(`/admin/clients/${clientId}/invoice?title=${encodeURIComponent(projectTitle)}`)
    } else {
      navigate(`/admin/invoice?title=${encodeURIComponent(projectTitle)}`)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top action header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4 no-print">
        <div className="flex items-center gap-3">
          <Link
            to={clientId ? `/admin/clients/${clientId}` : '/admin/clients'}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-card border border-rule px-3 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            <Icon icon={ArrowLeft} size={15} />
            Back
          </Link>
          <div>
            <h1 className="text-[1.4rem] font-semibold leading-tight text-ink">Developer Agreement Generator</h1>
            <p className="text-xs text-ink-muted">
              Live agreement matching the official VerneX agreement template with automatic multi-page break.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={handlePrint} className="gap-1.5">
            <Icon icon={Printer} size={15} />
            Print / Save as PDF
          </Button>

          {clientId && (
            <Button onClick={handleSaveAgreement} loading={createDocument.isPending} className="gap-1.5">
              <Icon icon={FileText} size={15} />
              Save Agreement
            </Button>
          )}

          <Button variant="primary" onClick={handleProceedToInvoice} className="gap-1.5">
            Proceed to Invoice
            <Icon icon={ArrowRight} size={15} />
          </Button>
        </div>
      </div>

      {/* Main split grid: Controls on left, Live Agreement Document on right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Control Panel (col-span-5) */}
        <div className="flex flex-col gap-5 lg:col-span-5 no-print">
          <Card>
            <CardBody className="flex flex-col gap-4 p-5">
              <h2 className="text-base font-semibold text-ink">Agreement Details</h2>

              {!clientId && (
                <Field label="Select Client (Optional)">
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
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="e.g. VNX - SCHOOL ERP PROJECT"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Agreement Date">
                  <Input
                    value={agreementDate}
                    onChange={(e) => setAgreementDate(e.target.value)}
                    placeholder="DD/MM/YYYY"
                  />
                </Field>

                <Field label="Developer Name">
                  <Input
                    value={developerName}
                    onChange={(e) => setDeveloperName(e.target.value)}
                    placeholder="e.g. Haran"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Company Name">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="Signer Name">
                  <Input value={companySigner} onChange={(e) => setCompanySigner(e.target.value)} />
                </Field>
                <Field label="Signer Title">
                  <Input value={companyTitle} onChange={(e) => setCompanyTitle(e.target.value)} />
                </Field>
              </div>

              <div className="rounded-card border border-rule bg-paper/50 p-3.5">
                <span className="text-xs font-semibold text-ink">Developer Signature Upload</span>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Click the signature box in the preview or upload an image file here to fit the developer signature slot.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="file"
                    ref={signatureInputRef}
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => signatureInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Icon icon={Upload} size={14} />
                    {devSignature ? 'Change Signature' : 'Upload Signature'}
                  </Button>
                  {devSignature && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDevSignature(null)}
                      className="text-bad hover:bg-bad/10"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2">
                <span className="text-xs font-semibold text-ink">Multi-page Split Controls</span>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Page 1 Clauses">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={page1ClauseCount}
                      onChange={(e) => setPage1ClauseCount(Number(e.target.value) || 1)}
                    />
                  </Field>
                  <Field label="Page 2 Clauses">
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={page2ClauseCount}
                      onChange={(e) => setPage2ClauseCount(Number(e.target.value) || 1)}
                    />
                  </Field>
                </div>
              </div>
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
                      onChange={(e) => handleUpdateClause(index, { title: e.target.value })}
                      placeholder="Clause Title"
                    />
                    <textarea
                      rows={3}
                      className="w-full rounded-control border border-rule bg-surface p-2 text-xs leading-relaxed text-ink focus:border-signal focus:outline-none"
                      value={clause.body}
                      onChange={(e) => handleUpdateClause(index, { body: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right Live Document Preview (col-span-7) */}
        <div className="flex flex-col items-center gap-8 lg:col-span-7">
          {pages.map((pg, pageIdx) => {
            const isLastPage = pageIdx === pages.length - 1

            return (
              <div
                key={pg.pageNumber}
                className="relative flex min-h-[1120px] w-full max-w-[780px] flex-col justify-between rounded-lg border border-rule bg-white p-10 text-neutral-900 shadow-md print:m-0 print:min-h-screen print:max-w-none print:rounded-none print:border-none print:p-8 print:shadow-none print:break-after-page"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {/* Header Section from AGREEMENT_TEMPLATE.pdf */}
                <div>
                  <div className="flex items-center justify-between pb-3">
                    {/* Left Brand */}
                    <div className="flex items-center gap-3">
                      <img
                        src="/vernex-logo.jpg"
                        alt="Vernex Logo"
                        className="h-12 w-auto object-contain"
                      />
                      <div className="flex flex-col">
                        <span className="font-serif text-[1.4rem] font-bold tracking-wider text-[#1e293b]">
                          {companyName.toUpperCase()}
                        </span>
                        <span className="text-[11px] italic text-[#64748b]">
                          Crafting your digital narrative.
                        </span>
                      </div>
                    </div>

                    {/* Right Contact Info */}
                    <div className="text-right text-[11px] leading-tight text-[#334155]">
                      <div className="font-semibold text-[#0f172a]">Vernex Digital Marketing</div>
                      <div>+91 9789912805</div>
                      <div className="text-[#0284c7]">http://www.vernex.in/</div>
                    </div>
                  </div>

                  {/* Horizontal solid black bar from template */}
                  <div className="h-2 w-full bg-black mb-6" />

                  {/* Top Right Date */}
                  <div className="mb-4 text-right font-sans text-xs font-semibold text-neutral-800">
                    Date : <span className="font-bold">{agreementDate}</span>
                  </div>

                  {/* First Page Title & Preamble */}
                  {pg.isFirst && (
                    <div className="mb-6 flex flex-col items-center gap-2 text-center">
                      <h2 className="text-sm font-bold uppercase tracking-wide underline underline-offset-4 text-neutral-950 sm:text-base">
                        DEVELOPER ENGAGEMENT &amp; NON-OWNERSHIP AGREEMENT
                      </h2>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                        {projectTitle}
                      </h3>

                      <div className="my-3 text-left font-sans text-[12.5px] leading-relaxed text-neutral-800">
                        <p className="italic">
                          &ldquo;This Agreement is made on this{' '}
                          <span className="font-semibold underline">{agreementDate}</span>, at Chennai, India, by and between:
                        </p>
                        <p className="mt-1 pl-4">
                          <span className="font-bold underline">{companyName}</span>, represented by{' '}
                          <span className="font-bold underline">Mr. {companySigner}, {companyTitle}</span>, hereinafter referred to as the{' '}
                          <span className="font-bold italic">&ldquo;Company&rdquo;</span> (which includes its successors and assigns),
                        </p>
                        <p className="mt-1 text-center font-bold">AND</p>
                        <p className="mt-1 pl-4">
                          <span className="font-bold underline">Mr. {developerName}</span>, hereinafter referred to as the{' '}
                          <span className="font-bold italic">&ldquo;Developer&rdquo;</span> (which expression shall include his heirs, legal representatives, and permitted assigns).&rdquo;
                        </p>
                      </div>

                      <div className="my-2 w-full border-t border-neutral-300 pt-2 text-center">
                        <span className="font-sans text-xs font-bold uppercase tracking-widest underline underline-offset-4 text-neutral-950">
                          TERMS &amp; CONDITIONS
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Clauses for this page */}
                  <div className="flex flex-col gap-4 font-sans text-[12.5px] leading-relaxed text-neutral-800">
                    {pg.clauses.map((clause) => {
                      const renderedBody = clause.body
                        .replace(/{{projectTitle}}/g, projectTitle)
                        .replace(/{{developerName}}/g, developerName)
                        .replace(/{{companyName}}/g, companyName)
                        .replace(/{{companySigner}}/g, companySigner)

                      return (
                        <div key={clause.id} className="flex flex-col gap-0.5">
                          <div className="font-bold text-neutral-950">
                            {clause.number}, {clause.title}:
                          </div>
                          <p className="text-justify text-neutral-800 whitespace-pre-line">{renderedBody}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Footer Section */}
                <div className="mt-8 flex flex-col gap-6">
                  {/* Last Page Signatures block */}
                  {isLastPage && (
                    <div className="flex flex-col gap-6 pt-4">
                      {/* Witness statement */}
                      <p className="text-center font-sans text-xs italic leading-relaxed text-neutral-700">
                        &ldquo;IN WITNESS WHEREOF, the parties hereto have carefully read, fully understood, and mutually agreed to the terms of this Agreement, and have executed the same by affixing their signatures as evidence of their free and informed consent.&rdquo;
                      </p>

                      {/* Side by side signature boxes */}
                      <div className="grid grid-cols-2 gap-8 font-sans text-xs text-neutral-900">
                        {/* Company Signature */}
                        <div className="flex flex-col items-start gap-1">
                          <div className="font-semibold text-neutral-950">Signed,</div>
                          <div className="text-neutral-700">{companyTitle}, {companyName}:</div>

                          {/* Authentic Boss Anandaa Signature image */}
                          <div className="relative my-1 flex h-16 w-36 items-center justify-center overflow-hidden rounded border border-neutral-200 bg-neutral-50/50">
                            <img
                              src="/boss-signature.jpg"
                              alt="Boss Anandaa Signature"
                              className="h-28 w-28 -rotate-90 object-contain drop-shadow-sm"
                            />
                          </div>

                          <div className="font-bold text-neutral-950">{companySigner}</div>
                          <div className="text-neutral-600">({agreementDate})</div>
                        </div>

                        {/* Developer Signature Slot */}
                        <div className="flex flex-col items-start gap-1">
                          <div className="font-semibold text-neutral-950">Signed,</div>
                          <div className="text-neutral-700">Developer:</div>

                          {/* Interactive Clickable Signature Box */}
                          <div
                            onClick={() => signatureInputRef.current?.click()}
                            title="Click to upload developer signature image"
                            className="group relative my-1 flex h-16 w-44 cursor-pointer items-center justify-center overflow-hidden rounded border-2 border-dashed border-neutral-300 bg-neutral-50/70 transition-colors hover:border-signal hover:bg-neutral-100"
                          >
                            {devSignature ? (
                              <img
                                src={devSignature}
                                alt="Developer Signature"
                                className="h-full w-full object-contain p-1"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-0.5 p-1 text-center text-[10px] text-neutral-500 group-hover:text-signal">
                                <Icon icon={ImageIcon} size={16} />
                                <span>Click to upload signature</span>
                              </div>
                            )}
                          </div>

                          <div className="font-bold text-neutral-950">{developerName}</div>
                          <div className="text-neutral-600">({agreementDate})</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom Bar & Page Number from AGREEMENT_TEMPLATE.pdf */}
                  <div className="relative flex items-center justify-center pt-4">
                    <span className="font-sans text-xs font-semibold text-neutral-700">
                      {pg.pageNumber}
                    </span>
                    {/* Bottom right curved decorative black shape from AGREEMENT_TEMPLATE */}
                    <div className="absolute -bottom-10 -right-10 h-10 w-24 rounded-tl-[36px] bg-black print:hidden" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
