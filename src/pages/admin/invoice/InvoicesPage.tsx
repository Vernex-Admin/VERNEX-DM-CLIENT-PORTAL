import { useMemo, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { Link } from 'react-router'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Combobox, EmptyState, Field, Input, Pill, Select, Skeleton, Table } from '../../../components/ui'
import type { Column } from '../../../components/ui'
import { formatDate, formatDateTime } from '../../../lib/dates'
import { monthLabel } from '../../../lib/invoiceDocument'
import { formatMoney } from '../../../lib/invoiceMath'
import { INVOICE_LIFECYCLE } from '../../../lib/labels'
import { useCan } from '../../../lib/permissions'
import { useClients, useInvoices } from '../../../lib/queries'
import type { Invoice, InvoiceStatus } from '../../../types/db'

const STATUS_FILTERS: { value: string; label: string; matches: InvoiceStatus[] }[] = [
  { value: '', label: 'All statuses', matches: [] },
  { value: 'draft', label: 'Draft', matches: ['draft'] },
  { value: 'issued', label: 'Issued', matches: ['sent', 'viewed'] },
  { value: 'partially_paid', label: 'Partially paid', matches: ['partially_paid'] },
  { value: 'paid', label: 'Paid', matches: ['paid'] },
  { value: 'overdue', label: 'Overdue', matches: ['overdue'] },
  { value: 'void', label: 'Cancelled', matches: ['void'] },
]

const linkButton =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-card border px-4 text-[1rem] font-medium lg:min-h-[36px]'

/** Admin → Invoices: every invoice the signed-in staff member can see, across clients. */
export default function InvoicesPage() {
  const invoices = useInvoices()
  const clients = useClients()
  const canCreate = useCan('invoice', 'create')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [clientId, setClientId] = useState('')
  const names = useMemo(() => new Map((clients.data ?? []).map((client) => [client.id, client.name])), [clients.data])

  const rows = useMemo(() => {
    const wanted = STATUS_FILTERS.find((filter) => filter.value === status)?.matches ?? []
    const needle = search.trim().toLowerCase()
    return (invoices.data ?? [])
      .filter((invoice) => (wanted.length === 0 || wanted.includes(invoice.status)) && (!clientId || invoice.client_id === clientId))
      .filter((invoice) => {
        if (!needle) return true
        const period = monthLabel(invoice.document?.billing_month ?? '')
        return `${invoice.number} ${names.get(invoice.client_id) ?? ''} ${period}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [invoices.data, status, clientId, search, names])

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      mono: true,
      cell: (row) => (
        <Link to={`/admin/invoices/${row.id}`} className="underline-offset-2 hover:underline" aria-label={`Open ${row.number}`}>
          {row.number}
        </Link>
      ),
    },
    { key: 'client', header: 'Client', cell: (row) => names.get(row.client_id) ?? '' },
    { key: 'period', header: 'Billing period', cell: (row) => monthLabel(row.document?.billing_month ?? '') },
    { key: 'issued', header: 'Issued', cell: (row) => (row.issued_at ? formatDate(row.issued_at) : row.status === 'draft' ? '' : formatDate(row.issue_date)) },
    { key: 'due', header: 'Due', cell: (row) => formatDate(row.due_date) },
    { key: 'total', header: 'Total', align: 'right', mono: true, cell: (row) => formatMoney(row.total_minor, row.currency) },
    { key: 'status', header: 'Status', cell: (row) => <Pill tone={INVOICE_LIFECYCLE[row.status].tone}>{INVOICE_LIFECYCLE[row.status].label}</Pill> },
    { key: 'updated', header: 'Last changed', cell: (row) => formatDateTime(row.updated_at) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.4rem] leading-tight">Invoices</h1>
        {canCreate && (
          <Link to="/admin/invoices/new" className={`${linkButton} border-signal bg-signal text-surface hover:bg-signal/90`}>
            <Icon icon={Plus} size={16} />
            Create invoice
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Search">
          <Input type="search" placeholder="Number, client or month" value={search} onChange={(event) => setSearch(event.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Client">
          <Combobox
            value={clientId}
            placeholder="All clients"
            onChange={setClientId}
            options={[{ value: '', label: 'All clients' }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))]}
          />
        </Field>
      </div>

      {invoices.isPending || clients.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : invoices.isError ? (
        <QueryError what="the invoices" error={invoices.error} onRetry={() => invoices.refetch()} />
      ) : (
        <Table
          dense
          caption="Invoices"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Receipt}
              title={invoices.data.length === 0 ? 'No invoices yet' : 'No invoices match'}
              description={invoices.data.length === 0 ? 'Create the first invoice for a client.' : 'Change the search or filters.'}
            />
          }
        />
      )}
    </div>
  )
}
