import { useRef, useState } from 'react'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { invoiceFileName, useInvoiceImages } from '../../components/invoice/invoiceImages'
import { InvoiceWorkspace } from '../../components/invoice/InvoiceWorkspace'
import type { InvoiceWorkspaceHandle } from '../../components/invoice/InvoiceWorkspace'
import { QueryError } from '../../components/QueryError'
import { Button, Pill, Skeleton, useToast } from '../../components/ui'
import { formatDate } from '../../lib/dates'
import { isUnpaid, owed } from '../../lib/invoices'
import { documentFromLegacy, monthLabel } from '../../lib/invoiceDocument'
import { formatMoney } from '../../lib/invoiceMath'
import { INVOICE_STATUS } from '../../lib/labels'
import { useClient, useInvoice } from '../../lib/queries'

/**
 * Client Portal → Billing → Invoices → one invoice, on the Vernex A4 pages, to read, print or
 * download. The data layer (and RLS) returns only the signed-in client's own invoices, never drafts.
 */
export default function InvoiceViewPage() {
  const { id } = useParams()
  const toast = useToast()
  const workspace = useRef<InvoiceWorkspaceHandle>(null)
  const [exporting, setExporting] = useState(false)
  const invoice = useInvoice(id)
  const client = useClient(invoice.data?.client_id)
  const data = invoice.data
  const document = data ? (data.document ?? documentFromLegacy(data, data.items, client.data)) : null
  const images = useInvoiceImages(document)

  if (invoice.isPending) {
    return (
      <div aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    )
  }
  if (invoice.isError || !data || !document) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <QueryError what="this invoice" error={invoice.error} onRetry={() => invoice.refetch()} />
        <Link to="/billing/invoices" className="underline">
          Back to invoices
        </Link>
      </div>
    )
  }

  const meta = { number: data.number, issue_date: data.issue_date, due_date: data.due_date }
  const stamp = data.status === 'paid' ? { label: 'Paid', tone: 'ok' as const } : data.status === 'void' ? { label: 'Cancelled', tone: 'bad' as const } : null
  const status = INVOICE_STATUS[data.status]

  async function download() {
    setExporting(true)
    try {
      await workspace.current?.downloadPdf()
    } catch (error) {
      toast({
        title: 'Could not create the PDF',
        description: `${error instanceof Error ? error.message : 'Try again.'} Use Print and choose “Save as PDF” instead.`,
        tone: 'bad',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/billing/invoices"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-card border border-rule px-3 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            <Icon icon={ArrowLeft} size={15} />
            Invoices
          </Link>
          <h1 className="flex items-center gap-2 text-[1.4rem] leading-tight">
            Invoice {data.number}
            <Pill tone={status.tone}>{status.label}</Pill>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => workspace.current?.print()}>
            <Icon icon={Printer} size={15} />
            Print
          </Button>
          <Button variant="primary" loading={exporting} onClick={() => void download()}>
            <Icon icon={Download} size={15} />
            Download PDF
          </Button>
        </div>
      </div>

      <dl aria-label="Invoice summary" className="grid grid-cols-2 gap-3 rounded-card border border-rule bg-surface p-3 text-sm sm:grid-cols-5">
        <Fact label="Issued" value={formatDate(data.issued_at ?? data.issue_date)} />
        <Fact label="Due" value={formatDate(data.due_date)} />
        <Fact label="Billing period" value={monthLabel(document.billing_month) || 'Not stated'} />
        <Fact label="Total" value={formatMoney(data.total_minor, data.currency)} />
        <Fact label={isUnpaid(data) ? 'Amount due' : 'Received'} value={formatMoney(isUnpaid(data) ? owed(data) : data.amount_paid_minor, data.currency)} />
      </dl>

      <InvoiceWorkspace ref={workspace} fileName={invoiceFileName(data.number)} document={document} meta={meta} images={images} stamp={stamp} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
