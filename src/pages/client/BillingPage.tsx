import { useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'
import { QueryError } from '../../components/QueryError'
import { Button, Drawer, EmptyState, Pill, Skeleton, Table, useToast } from '../../components/ui'
import type { Column } from '../../components/ui'
import { formatDate, istDay } from '../../lib/dates'
import { INVOICE_STATUS } from '../../lib/labels'
import { isUnpaid, owed } from '../../lib/invoices'
import { formatINR } from '../../lib/money'
import { useInvoice, useInvoices, useProjects } from '../../lib/queries'
import type { Invoice } from '../../types/db'

export default function BillingPage() {
  const toast = useToast()
  const invoices = useInvoices()
  const projects = useProjects()
  const [openId, setOpenId] = useState<string>()

  // Drafts are Vernex's own working copies; a client only sees what was sent.
  const rows = useMemo(
    () =>
      (invoices.data ?? [])
        .filter((invoice) => invoice.status !== 'draft')
        .sort((a, b) => b.issue_date.localeCompare(a.issue_date)),
    [invoices.data],
  )
  const projectNames = useMemo(
    () => Object.fromEntries((projects.data ?? []).map((project) => [project.id, project.name])),
    [projects.data],
  )

  const totals = useMemo(() => {
    const today = istDay(new Date())
    const year = today.slice(0, 4)
    return {
      outstanding: rows.filter(isUnpaid).reduce((sum, invoice) => sum + owed(invoice), 0),
      overdue: rows
        .filter((invoice) => isUnpaid(invoice) && (invoice.status === 'overdue' || invoice.due_date < today))
        .reduce((sum, invoice) => sum + owed(invoice), 0),
      paidThisYear: rows
        .filter((invoice) => invoice.paid_at !== null && istDay(invoice.paid_at).startsWith(year))
        .reduce((sum, invoice) => sum + invoice.amount_paid_minor, 0),
    }
  }, [rows])

  const payNow = () =>
    toast({ title: 'Online payment is coming soon', description: 'For now, pay by bank transfer using the details on the invoice.' })

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      mono: true,
      cell: (invoice) => (
        <button type="button" onClick={() => setOpenId(invoice.id)} className="inline-flex min-h-[44px] items-center font-mono underline-offset-2 hover:underline">
          {invoice.number}
        </button>
      ),
    },
    { key: 'project', header: 'Project', cell: (invoice) => (invoice.project_id ? projectNames[invoice.project_id] : null) ?? 'General' },
    { key: 'due', header: 'Due', cell: (invoice) => formatDate(invoice.due_date) },
    { key: 'amount', header: 'Amount', align: 'right', mono: true, cell: (invoice) => formatINR(invoice.total_minor) },
    {
      key: 'status',
      header: 'Status',
      cell: (invoice) => {
        const status = INVOICE_STATUS[invoice.status]
        return <Pill tone={status.tone}>{status.label}</Pill>
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (invoice) => (
        <span className="inline-flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={() => setOpenId(invoice.id)} aria-label={`View ${invoice.number}`}>
            View
          </Button>
          {isUnpaid(invoice) && (
            <Button size="sm" variant="primary" onClick={payNow} aria-label={`Pay now, ${invoice.number}`}>
              Pay now
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-[1.6rem] leading-tight">Billing</h1>

      {invoices.isPending ? (
        <BillingSkeleton />
      ) : invoices.isError ? (
        <QueryError what="your invoices" onRetry={() => invoices.refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Summary label="Outstanding" value={totals.outstanding} />
            <Summary label="Overdue" value={totals.overdue} bad={totals.overdue > 0} />
            <Summary label="Paid this year" value={totals.paidThisYear} />
          </dl>

          <Table
            caption="Invoices"
            columns={columns}
            rows={rows}
            rowKey={(invoice) => invoice.id}
            empty={
              <EmptyState
                icon={Receipt}
                title="No invoices yet"
                description="Your invoices will appear here as soon as Vernex sends the first one."
              />
            }
          />
        </>
      )}

      <InvoiceDrawer id={openId} onClose={() => setOpenId(undefined)} onPay={payNow} />
    </div>
  )
}

function Summary({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-rule bg-surface p-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`font-display text-[1.75rem] leading-none font-semibold ${bad ? 'text-bad' : ''}`}>{formatINR(value)}</dd>
    </div>
  )
}

function InvoiceDrawer({ id, onClose, onPay }: { id: string | undefined; onClose: () => void; onPay: () => void }) {
  const invoice = useInvoice(id)
  const data = invoice.data
  const status = data ? INVOICE_STATUS[data.status] : undefined

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={data ? `Invoice ${data.number}` : 'Invoice'}
      description={data ? `Issued ${formatDate(data.issue_date)} · Due ${formatDate(data.due_date)}` : undefined}
      footer={
        data && isUnpaid(data) ? (
          <Button variant="primary" onClick={onPay}>
            Pay now
          </Button>
        ) : undefined
      }
    >
      {invoice.isPending && id ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : invoice.isError ? (
        <QueryError what="this invoice" onRetry={() => invoice.refetch()} />
      ) : data ? (
        <div className="flex flex-col gap-4">
          {status && (
            <div>
              <Pill tone={status.tone}>{status.label}</Pill>
            </div>
          )}
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Invoice lines</caption>
            <thead>
              <tr className="border-b border-rule text-sm text-ink-muted">
                <th scope="col" className="py-2 pr-2 font-medium">Description</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-rule align-top">
                  <td className="py-2 pr-2">
                    {item.description}
                    {item.sac_code && <span className="block text-sm text-ink-muted">SAC {item.sac_code}</span>}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{item.quantity}</td>
                  <td className="py-2 pl-2 text-right font-mono">{formatINR(item.amount_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto flex w-full max-w-xs flex-col gap-1.5">
            <Line label="Subtotal" value={data.subtotal_minor} />
            <Line label="CGST 9%" value={data.cgst_minor} />
            <Line label="SGST 9%" value={data.sgst_minor} />
            {data.igst_minor > 0 && <Line label="IGST" value={data.igst_minor} />}
            <Line label="Total" value={data.total_minor} strong />
            {data.amount_paid_minor > 0 && <Line label="Paid" value={data.amount_paid_minor} />}
            {isUnpaid(data) && <Line label="Balance due" value={owed(data)} strong />}
          </dl>
        </div>
      ) : null}
    </Drawer>
  )
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-rule pt-1.5 font-medium' : ''}`}>
      <dt className={strong ? '' : 'text-ink-muted'}>{label}</dt>
      <dd className="font-mono">{formatINR(value)}</dd>
    </div>
  )
}

function BillingSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((tile) => (
          <div key={tile} className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
