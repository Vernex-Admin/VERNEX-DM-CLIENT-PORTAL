import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { formatDate } from '../../lib/dates'
import { blankLine, monthLabel } from '../../lib/invoiceDocument'
import { computeInvoice, currencySymbol, formatAmount, formatRate } from '../../lib/invoiceMath'
import type { PagePlan } from '../../lib/invoicePagination'
import type { InvoiceDocument, InvoiceLine } from '../../types/invoiceDocument'
import { Icon } from '../Icon'
import { Button } from '../ui'
import { AutoTextarea, NumberInput } from './inputs'

// The Vernex A4 invoice, laid out after the "Vernex DM - Invoice Generator" PDF template.
// The same parts build three things: the continuous sheet the admin types into, the hidden copy
// that is measured for page breaks, and the A4 pages shown in preview, printed and saved as PDF.

export type SheetMeta = { number: string; issue_date: string; due_date: string }

export type SheetEditing = {
  setDocument: (update: (document: InvoiceDocument) => InvoiceDocument) => void
  setMeta: (patch: Partial<SheetMeta>) => void
  /** Problems by field key (see validateInvoice), shown on the matching cell. */
  issues: Record<string, string>
  /** Shown in the number cell while it is empty. */
  numberPlaceholder: string
}

export type InvoiceSheetProps = {
  document: InvoiceDocument
  meta: SheetMeta
  /** Resolved image URLs; null hides the image. */
  images: { logo: string | null; qr: string | null }
  /** A stamp across the header, e.g. PAID or CANCELLED. */
  stamp?: { label: string; tone: 'ok' | 'bad' } | null
  edit?: SheetEditing
}

const showDate = (day: string) => (day ? formatDate(day) : '')

function servicePeriod(start: string, end: string) {
  if (start && end) return `${showDate(start)} – ${showDate(end)}`
  return showDate(start || end)
}

const showQuantity = (quantity: number | null) =>
  quantity === null || !Number.isFinite(quantity) ? '' : String(Number(quantity.toFixed(2)))

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

/** Render functions for each part of the invoice, sharing one set of props. */
function sheetParts({ document, meta, images, stamp, edit }: InvoiceSheetProps) {
  const totals = computeInvoice(document)
  const symbol = currencySymbol(document.currency)
  const money = (minor: number) => formatAmount(minor, document.currency)
  const { tax, discount } = document
  const halfRate = formatRate(tax.rate / 2)
  const set = edit?.setDocument
  const issue = (field: string) => edit?.issues[field]

  /** A single-line or multi-line value on its underline. */
  function text(value: string, label: string, onChange: (value: string) => void, options: { multiline?: boolean; placeholder?: string; field?: string } = {}) {
    if (!edit) return value
    const invalid = options.field ? Boolean(issue(options.field)) : false
    const common = {
      className: 'ivx-input',
      'aria-label': label,
      'aria-invalid': invalid || undefined,
      title: options.field ? issue(options.field) : undefined,
      placeholder: options.placeholder,
      value,
    }
    return options.multiline ? (
      <AutoTextarea {...common} onChange={(event) => onChange(event.target.value)} />
    ) : (
      <input {...common} type="text" onChange={(event) => onChange(event.target.value)} />
    )
  }

  function date(value: string, label: string, onChange: (value: string) => void, field?: string) {
    if (!edit) return showDate(value)
    return (
      <input
        className="ivx-input"
        type="date"
        aria-label={label}
        aria-invalid={field && issue(field) ? true : undefined}
        title={field ? issue(field) : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  const company = (key: Exclude<keyof InvoiceDocument['company'], 'logo'>) => (value: string) =>
    set?.((d) => ({ ...d, company: { ...d.company, [key]: value } }))
  const billTo = (key: keyof InvoiceDocument['bill_to']) => (value: string) =>
    set?.((d) => ({ ...d, bill_to: { ...d.bill_to, [key]: value } }))
  const project = (key: keyof InvoiceDocument['project']) => (value: string) =>
    set?.((d) => ({ ...d, project: { ...d.project, [key]: value } }))
  const footer = (key: keyof InvoiceDocument['footer']) => (value: string) =>
    set?.((d) => ({ ...d, footer: { ...d.footer, [key]: value } }))

  const updateLine = (id: string, patch: Partial<InvoiceLine>) =>
    set?.((d) => ({ ...d, lines: d.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) }))
  const moveLine = (index: number, by: number) =>
    set?.((d) => {
      const lines = [...d.lines]
      const [moved] = lines.splice(index, 1)
      if (moved) lines.splice(index + by, 0, moved)
      return { ...d, lines }
    })
  const removeLine = (index: number) => set?.((d) => ({ ...d, lines: d.lines.filter((_, i) => i !== index) }))
  const addLine = () => set?.((d) => ({ ...d, lines: [...d.lines, blankLine()] }))

  const stampElement = stamp ? <div className={`ivx-stamp ${stamp.tone}`}>{stamp.label}</div> : null

  /** Letterhead, invoice details, Bill To and Project Details: the top of the first page. */
  const top = () => (
    <div className="ivx-block-top" data-measure="top">
      <header className="ivx-head">
        <div className="ivx-brand">
          {images.logo ? (
            <img className="ivx-logo" src={images.logo} alt={document.company.name || 'Company logo'} />
          ) : edit ? (
            <div className="ivx-logo-empty">No logo</div>
          ) : null}
          <div className="ivx-tagline">{text(document.company.tagline, 'Tagline', company('tagline'), { placeholder: 'Tagline' })}</div>
        </div>
        <dl className="ivx-contact">
          <Row label="Phone:">{text(document.company.phone, 'Company phone', company('phone'))}</Row>
          <Row label="Website:">
            <strong>{text(document.company.website, 'Company website', company('website'))}</strong>
          </Row>
          <Row label="Email:">{text(document.company.email, 'Company email', company('email'))}</Row>
          <Row label="Address:">
            {text(document.company.address, 'Company address', company('address'), { multiline: true, placeholder: 'Not set' })}
          </Row>
          {(edit || document.company.gstin) && (
            <Row label="GSTIN:">{text(document.company.gstin, 'Company GSTIN', company('gstin'), { placeholder: 'Not set' })}</Row>
          )}
        </dl>
      </header>

      <hr className="ivx-gold-rule" />

      <section className="ivx-title-row">
        <div>
          <h1 className="ivx-title">INVOICE</h1>
          <p className="ivx-subtitle">DIGITAL MARKETING SERVICES</p>
        </div>
        <dl className="ivx-meta">
          <Row label="Invoice Number">
            {edit ? (
              <input
                className="ivx-input"
                aria-label="Invoice number"
                placeholder={edit.numberPlaceholder}
                value={meta.number}
                onChange={(event) => edit.setMeta({ number: event.target.value })}
              />
            ) : (
              meta.number
            )}
          </Row>
          <Row label="Invoice Date">{date(meta.issue_date, 'Invoice date', (value) => edit?.setMeta({ issue_date: value }))}</Row>
          <Row label="Due Date">{date(meta.due_date, 'Due date', (value) => edit?.setMeta({ due_date: value }), 'due_date')}</Row>
          <Row label="Billing Period / Month">
            {edit ? (
              <input
                className="ivx-input"
                type="month"
                aria-label="Billing month"
                value={document.billing_month}
                onChange={(event) => set?.((d) => ({ ...d, billing_month: event.target.value }))}
              />
            ) : (
              monthLabel(document.billing_month)
            )}
          </Row>
          {(edit || document.payment_terms) && (
            <Row label="Payment Terms">
              {text(document.payment_terms, 'Payment terms', (value) => set?.((d) => ({ ...d, payment_terms: value })), {
                multiline: true,
                placeholder: 'e.g. Due within 15 days',
              })}
            </Row>
          )}
        </dl>
      </section>

      <section className="ivx-parties">
        <div className="ivx-party">
          <h2 className="ivx-bar">BILL TO</h2>
          <dl>
            <Row label="Client / Company Name">
              {text(document.bill_to.company_name, 'Client or company name', billTo('company_name'), { field: 'bill_to' })}
            </Row>
            <Row label="Contact Person">{text(document.bill_to.contact_person, 'Contact person', billTo('contact_person'))}</Row>
            <Row label="Billing Address">{text(document.bill_to.address, 'Billing address', billTo('address'), { multiline: true })}</Row>
            <Row label="Email">{text(document.bill_to.email, 'Client email', billTo('email'))}</Row>
            <Row label="Phone">{text(document.bill_to.phone, 'Client phone', billTo('phone'))}</Row>
            <Row label="GSTIN / Tax Details">{text(document.bill_to.gstin, 'Client GSTIN or tax details', billTo('gstin'))}</Row>
          </dl>
        </div>
        <div className="ivx-party">
          <h2 className="ivx-bar">PROJECT DETAILS</h2>
          <dl>
            <Row label="Project / Campaign Name">{text(document.project.name, 'Project or campaign name', project('name'), { multiline: true })}</Row>
            <Row label="Project Code">{text(document.project.code, 'Project code', project('code'))}</Row>
            <Row label="Service Period">
              {edit ? (
                <span className="ivx-split">
                  {date(document.project.service_period_start, 'Service period start', project('service_period_start'))}
                  <span aria-hidden="true">–</span>
                  {date(document.project.service_period_end, 'Service period end', project('service_period_end'))}
                </span>
              ) : (
                servicePeriod(document.project.service_period_start, document.project.service_period_end)
              )}
            </Row>
            <Row label="Campaign / Billing Address">
              {text(document.project.campaign_address, 'Campaign or billing address', project('campaign_address'), { multiline: true })}
            </Row>
          </dl>
        </div>
      </section>
    </div>
  )

  /** The heading on every page after the first. */
  const continued = () => (
    <div className="ivx-continued" data-measure="continued">
      <span className="ivx-continued-title">INVOICE</span>
      <span>{meta.number ? `${meta.number} · continued` : 'Continued'}</span>
    </div>
  )

  /** The service table, or the rows [start, end) of it. `pageStarts` marks rows that begin a new page. */
  const table = (start = 0, end = document.lines.length, pageStarts: Map<number, number> = new Map()) => (
    <div className="ivx-block-table" data-measure="table">
      <table className="ivx-table">
        <colgroup>
          <col style={{ width: '5.5%' }} />
          <col style={{ width: '40.5%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <thead data-measure="thead">
          <tr>
            <th scope="col">No.</th>
            <th scope="col">Service / Detailed Description</th>
            <th scope="col">Billing Period</th>
            <th scope="col">Qty</th>
            <th scope="col">Rate ({symbol})</th>
            <th scope="col">Amount ({symbol})</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.slice(start, end).map((line, offset) => {
            const index = start + offset
            const row = index + 1
            const amount = totals.line_amounts[index]
            const field = `line:${line.id}`
            const startsPage = pageStarts.get(index)
            return (
              <tr key={line.id} data-measure="row" className={startsPage ? 'ivx-page-start' : undefined}>
                <td className="ivx-no">
                  {startsPage && (
                    <span className="ivx-break-label" aria-hidden="true">
                      Page {startsPage}
                    </span>
                  )}
                  {row}
                </td>
                <td className="ivx-desc">
                  {text(line.description, `Description, row ${row}`, (value) => updateLine(line.id, { description: value }), {
                    multiline: true,
                    field: `${field}:description`,
                  })}
                </td>
                <td className="ivx-center">
                  {text(line.bill_period, `Billing period, row ${row}`, (value) => updateLine(line.id, { bill_period: value }), {
                    field: `${field}:bill_period`,
                  })}
                </td>
                <td className="ivx-center">
                  {edit ? (
                    <NumberInput
                      className="ivx-input"
                      style={{ textAlign: 'center' }}
                      aria-label={`Quantity, row ${row}`}
                      aria-invalid={issue(`${field}:quantity`) ? true : undefined}
                      title={issue(`${field}:quantity`)}
                      value={line.quantity}
                      onValue={(quantity) => updateLine(line.id, { quantity })}
                    />
                  ) : (
                    showQuantity(line.quantity)
                  )}
                </td>
                <td className="ivx-num">
                  {edit ? (
                    <NumberInput
                      className="ivx-input"
                      aria-label={`Rate, row ${row}`}
                      aria-invalid={issue(`${field}:rate`) ? true : undefined}
                      title={issue(`${field}:rate`)}
                      minorUnits
                      value={line.rate_minor}
                      onValue={(rate_minor) => updateLine(line.id, { rate_minor })}
                    />
                  ) : line.rate_minor !== null && Number.isFinite(line.rate_minor) ? (
                    money(line.rate_minor)
                  ) : (
                    ''
                  )}
                </td>
                <td className="ivx-num">
                  <span aria-label={`Amount, row ${row}`}>{amount == null ? '' : money(amount)}</span>
                  {edit && (
                    <span className="ivx-row-tools">
                      <button type="button" aria-label={`Move row ${row} up`} disabled={index === 0} onClick={() => moveLine(index, -1)}>
                        <Icon icon={ArrowUp} size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move row ${row} down`}
                        disabled={index === document.lines.length - 1}
                        onClick={() => moveLine(index, 1)}
                      >
                        <Icon icon={ArrowDown} size={14} />
                      </button>
                      <button type="button" aria-label={`Delete row ${row}`} onClick={() => removeLine(index)}>
                        <Icon icon={Trash2} size={14} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {edit && (
        <div className="ivx-add-row">
          <Button size="sm" onClick={addLine}>
            <Icon icon={Plus} size={14} />
            Add row
          </Button>
        </div>
      )}
    </div>
  )

  /** QR, totals and footer: always together, always on the last page. */
  const closing = () => (
    <div className="ivx-block-closing" data-measure="closing">
      <section className="ivx-bottom">
        <div className="ivx-pay">
          {images.qr && (
            <>
              <img className="ivx-qr" src={images.qr} alt="Payment QR code" />
              {document.payment.label && <div className="ivx-pay-label">{document.payment.label}</div>}
            </>
          )}
          {document.payment.instructions && <div className="ivx-pay-note">{document.payment.instructions}</div>}
        </div>
        <div className="ivx-totals">
          <dl aria-label="Invoice totals">
            <Row label={`Subtotal (${symbol})`}>{money(totals.subtotal_minor)}</Row>
            <Row label={discount.kind === 'percent' && discount.value > 0 ? `Discount ${formatRate(discount.value)}% (${symbol})` : `Discount (${symbol})`}>
              {totals.discount_minor > 0 ? money(totals.discount_minor) : ''}
            </Row>
            <Row label={`Taxable Amount (${symbol})`}>{money(totals.taxable_minor)}</Row>
            <Row label="GST Rate (%)">{tax.mode === 'none' ? 'Not applicable' : formatRate(tax.rate)}</Row>
            {tax.mode === 'cgst_sgst' && (
              <>
                <Row label={`CGST ${halfRate}% (${symbol})`}>{money(totals.cgst_minor)}</Row>
                <Row label={`SGST ${halfRate}% (${symbol})`}>{money(totals.sgst_minor)}</Row>
              </>
            )}
            {tax.mode === 'igst' && <Row label={`IGST ${formatRate(tax.rate)}% (${symbol})`}>{money(totals.igst_minor)}</Row>}
          </dl>
          <div className="ivx-due">
            <span>TOTAL AMOUNT DUE ({symbol})</span>
            <strong aria-label="Total amount due">{money(totals.total_minor)}</strong>
          </div>
        </div>
      </section>

      <footer className="ivx-foot">
        <hr className="ivx-gold-rule" />
        <p className="ivx-thanks">{text(document.footer.thank_you, 'Thank-you line', footer('thank_you'))}</p>
        <div className="ivx-closing">
          <span style={{ flex: 1 }}>{text(document.footer.closing, 'Closing line', footer('closing'))}</span>
          <span>{document.company.website}</span>
        </div>
        <hr className="ivx-gold-rule" />
      </footer>
    </div>
  )

  return { top, continued, table, closing, stampElement }
}

/**
 * The whole invoice on one continuous sheet: for typing into, and (read-only) for measuring.
 * `pageStarts` maps a row index to the page it begins, to mark page breaks while editing.
 */
export function InvoiceSheet(props: InvoiceSheetProps & { pageStarts?: Map<number, number>; measuring?: boolean }) {
  const parts = sheetParts(props)
  return (
    <article className="ivx-sheet" aria-label={props.meta.number ? `Invoice ${props.meta.number}` : 'Invoice'}>
      {parts.stampElement}
      {parts.top()}
      {parts.table(0, props.document.lines.length, props.pageStarts)}
      {parts.closing()}
      {props.measuring && parts.continued()}
    </article>
  )
}

/** The invoice as separate A4 pages, following a page plan. Read-only. */
export function InvoicePages(props: Omit<InvoiceSheetProps, 'edit'> & { plan: PagePlan[] }) {
  const parts = sheetParts(props)
  const numbered = props.document.show_page_numbers
  return (
    <div className="ivx-pages">
      {props.plan.map((page, index) => (
        <article
          key={index}
          className="ivx-page"
          aria-label={`${props.meta.number ? `Invoice ${props.meta.number}` : 'Invoice'}, page ${index + 1} of ${props.plan.length}`}
        >
          {page.first && parts.stampElement}
          {page.first ? parts.top() : parts.continued()}
          {page.table && parts.table(page.rows[0], page.rows[1])}
          {page.closing && parts.closing()}
          {numbered && (
            <div className="ivx-page-number">
              Page {index + 1} of {props.plan.length}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
