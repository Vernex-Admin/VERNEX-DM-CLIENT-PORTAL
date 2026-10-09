import { useState } from 'react'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../../components/admin/ConfirmDialog'
import { FormDrawer } from '../../../components/admin/FormDrawer'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, EmptyState, Field, Input, Pill, Select, Skeleton, Table, useToast } from '../../../components/ui'
import type { Column } from '../../../components/ui'
import { formatDate, istDay } from '../../../lib/dates'
import { INVOICE_STATUS } from '../../../lib/labels'
import { formatINR, invoiceTotals, toMinor, toRupeesInput } from '../../../lib/money'
import { useCan } from '../../../lib/permissions'
import {
  useCreateInvoice,
  useDeleteInvoice,
  useInvoice,
  useInvoices,
  useProjects,
  useUpdateInvoice,
} from '../../../lib/queries'
import { useForm } from '../../../lib/useForm'
import { INVOICE_STATUSES } from '../../../types/db'
import type { Invoice, InvoiceItemInsert, InvoiceStatus } from '../../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export function InvoicesTab({ clientId }: { clientId: string }) {
  const invoices = useInvoices({ client_id: clientId })
  const projects = useProjects({ client_id: clientId })
  const canCreate = useCan('invoice', 'create', { clientId })
  const [drawer, setDrawer] = useState<Invoice | 'new'>()
  const [deleting, setDeleting] = useState<Invoice>()
  const names = Object.fromEntries((projects.data ?? []).map((project) => [project.id, project.name]))

  const columns: Column<Invoice>[] = [
    { key: 'number', header: 'Invoice', mono: true, cell: (row) => row.number },
    { key: 'project', header: 'Project', cell: (row) => (row.project_id ? (names[row.project_id] ?? '') : '') },
    { key: 'issued', header: 'Issued', cell: (row) => formatDate(row.issue_date) },
    { key: 'due', header: 'Due', cell: (row) => formatDate(row.due_date) },
    { key: 'total', header: 'Total', align: 'right', mono: true, cell: (row) => formatINR(row.total_minor) },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Pill tone={INVOICE_STATUS[row.status].tone}>{row.status === 'sent' || row.status === 'viewed' ? 'Sent' : INVOICE_STATUS[row.status].label}</Pill>
      ),
    },
    { key: 'actions', header: 'Actions', cell: (row) => <RowActions invoice={row} onEdit={() => setDrawer(row)} onDelete={() => setDeleting(row)} /> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.1rem]">Invoices</h2>
        {canCreate && (
          <Button variant="primary" onClick={() => setDrawer('new')}>
            <Icon icon={Plus} size={16} />
            New invoice
          </Button>
        )}
      </div>

      {invoices.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : invoices.isError ? (
        <QueryError what="this client's invoices" onRetry={() => invoices.refetch()} />
      ) : (
        <Table
          dense
          caption="Invoices"
          columns={columns}
          rows={[...invoices.data].sort((a, b) => b.issue_date.localeCompare(a.issue_date))}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Create an invoice with ₹ line items. It stays a draft until you send it."
              action={
                canCreate ? (
                  <Button variant="primary" onClick={() => setDrawer('new')}>
                    New invoice
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      {drawer && <InvoiceDrawer clientId={clientId} invoice={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(undefined)} />}
      <DeleteInvoice invoice={deleting} onClose={() => setDeleting(undefined)} />
    </div>
  )
}

function RowActions({ invoice, onEdit, onDelete }: { invoice: Invoice; onEdit: () => void; onDelete: () => void }) {
  const canEdit = useCan('invoice', 'edit', { clientId: invoice.client_id })
  const canDelete = useCan('invoice', 'delete', { clientId: invoice.client_id })
  return (
    <span className="inline-flex gap-1">
      {canEdit && (
        <Button size="sm" variant="ghost" aria-label={`Edit ${invoice.number}`} onClick={onEdit}>
          Edit
        </Button>
      )}
      {canDelete && (
        <Button size="sm" variant="ghost" aria-label={`Delete ${invoice.number}`} onClick={onDelete}>
          Delete
        </Button>
      )}
    </span>
  )
}

type Line = { description: string; sac: string; quantity: string; price: string }
const blankLine = (): Line => ({ description: '', sac: '998361', quantity: '1', price: '' })

function InvoiceDrawer({ clientId, invoice, onClose }: { clientId: string; invoice: Invoice | undefined; onClose: () => void }) {
  const toast = useToast()
  const projects = useProjects({ client_id: clientId })
  const create = useCreateInvoice()
  const update = useUpdateInvoice()
  const can = useCan('invoice', invoice ? 'edit' : 'create', { clientId })
  // A new invoice is due two weeks after today; worked out once, when the drawer opens.
  const [{ today, fortnightAway }] = useState(() => ({
    today: istDay(new Date()),
    fortnightAway: istDay(new Date(Date.now() + 14 * 86_400_000)),
  }))
  // Editing needs the invoice's lines, which the list does not carry. They load into the open drawer.
  const detail = useInvoice(invoice?.id)
  const loading = Boolean(invoice) && detail.isPending
  const { values, set, dirty, reset } = useForm({
    project_id: invoice?.project_id ?? '',
    issue_date: invoice?.issue_date ?? today,
    due_date: invoice?.due_date ?? fortnightAway,
    status: (invoice?.status ?? 'draft') as InvoiceStatus,
    lines: [blankLine()],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadedFor, setLoadedFor] = useState<string>()
  if (detail.data && loadedFor !== detail.data.id) {
    // Once the lines arrive they are the starting point, so loading never counts as an edit.
    setLoadedFor(detail.data.id)
    reset({
      ...values,
      lines: detail.data.items.map((item) => ({
        description: item.description,
        sac: item.sac_code ?? '',
        quantity: String(item.quantity),
        price: toRupeesInput(item.unit_price_minor),
      })),
    })
  }

  function setLine(index: number, patch: Partial<Line>) {
    set('lines', values.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  // What the lines add up to right now, ignoring any that are not valid yet.
  const parsed: InvoiceItemInsert[] = values.lines.map((line) => ({
    description: line.description.trim(),
    sac_code: line.sac.trim() || null,
    quantity: Number(line.quantity),
    unit_price_minor: toMinor(line.price),
  }))
  const valid = parsed.filter((item) => item.description && Number.isFinite(item.quantity) && (item.quantity ?? 0) > 0 && Number.isFinite(item.unit_price_minor))
  const totals = invoiceTotals(valid)

  async function submit() {
    const next: Record<string, string> = {}
    if (values.due_date < values.issue_date) next.due_date = 'The due date cannot be before the issue date.'
    if (valid.length === 0 || valid.length !== values.lines.length) {
      next.lines = 'Every line needs a description, a quantity above zero and a price in rupees.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !can) return
    try {
      if (invoice) {
        const becomesPaid = values.status === 'paid' && invoice.status !== 'paid'
        await update.mutateAsync({
          id: invoice.id,
          patch: {
            project_id: values.project_id || null,
            issue_date: values.issue_date,
            due_date: values.due_date,
            status: values.status,
            items: valid,
            ...(becomesPaid ? { amount_paid_minor: totals.total_minor, paid_at: new Date().toISOString() } : {}),
          },
        })
        toast({ title: `${invoice.number} saved`, tone: 'ok' })
      } else {
        const created = await create.mutateAsync({
          client_id: clientId,
          project_id: values.project_id || null,
          issue_date: values.issue_date,
          due_date: values.due_date,
          status: values.status,
          items: valid,
        })
        toast({ title: `Invoice ${created.number} created`, tone: 'ok' })
      }
      onClose()
    } catch (error) {
      toast({ title: 'Could not save the invoice', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={invoice ? `Edit ${invoice.number}` : 'New invoice'}
      description="GST is added at 9% CGST and 9% SGST."
      dirty={dirty}
      onSubmit={submit}
      submitLabel={invoice ? 'Save changes' : 'Create invoice'}
      pending={create.isPending || update.isPending}
      submitDisabled={!can || loading || (Boolean(invoice) && detail.isError)}
    >
      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : invoice && detail.isError ? (
        <QueryError what="this invoice" onRetry={() => detail.refetch()} />
      ) : (
        <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project">
          <Select value={values.project_id} onChange={(event) => set('project_id', event.target.value)}>
            <option value="">Not tied to a project</option>
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" hint="Clients see an invoice once it is sent.">
          <Select value={values.status} onChange={(event) => set('status', event.target.value as InvoiceStatus)}>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'draft' ? 'Draft' : status === 'sent' ? 'Sent' : status === 'viewed' ? 'Viewed' : INVOICE_STATUS[status].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Issue date">
          <Input type="date" value={values.issue_date} onChange={(event) => set('issue_date', event.target.value)} />
        </Field>
        <Field label="Due date" error={errors.due_date}>
          <Input type="date" value={values.due_date} onChange={(event) => set('due_date', event.target.value)} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Line items</legend>
        {values.lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto] gap-2 rounded-card border border-rule p-3 sm:grid-cols-[2fr_1fr_5rem_1fr_auto]">
            <Input aria-label={`Description, line ${index + 1}`} placeholder="Description" value={line.description} onChange={(event) => setLine(index, { description: event.target.value })} className="col-span-2 sm:col-span-1" />
            <Input aria-label={`SAC code, line ${index + 1}`} placeholder="SAC" value={line.sac} onChange={(event) => setLine(index, { sac: event.target.value })} />
            <Input aria-label={`Quantity, line ${index + 1}`} inputMode="decimal" placeholder="Qty" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} />
            <Input aria-label={`Unit price in rupees, line ${index + 1}`} inputMode="decimal" placeholder="Price (₹)" value={line.price} onChange={(event) => setLine(index, { price: event.target.value })} />
            <Button
              aria-label={`Remove line ${index + 1}`}
              variant="ghost"
              disabled={values.lines.length === 1}
              onClick={() => set('lines', values.lines.filter((_, i) => i !== index))}
            >
              <Icon icon={Trash2} size={16} />
            </Button>
          </div>
        ))}
        {errors.lines && <p className="text-sm text-bad">{errors.lines}</p>}
        <div>
          <Button size="sm" onClick={() => set('lines', [...values.lines, blankLine()])}>
            <Icon icon={Plus} size={14} />
            Add line
          </Button>
        </div>
      </fieldset>

      <dl aria-label="Invoice totals" className="ml-auto flex w-full max-w-xs flex-col gap-1">
        <Total label="Subtotal" value={totals.subtotal_minor} />
        <Total label="CGST 9%" value={totals.cgst_minor} />
        <Total label="SGST 9%" value={totals.sgst_minor} />
        <Total label="Total" value={totals.total_minor} strong />
      </dl>
        </>
      )}
    </FormDrawer>
  )
}

function Total({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-rule pt-1 font-medium' : ''}`}>
      <dt className={strong ? '' : 'text-ink-muted'}>{label}</dt>
      <dd className="font-mono">{formatINR(value)}</dd>
    </div>
  )
}

function DeleteInvoice({ invoice, onClose }: { invoice: Invoice | undefined; onClose: () => void }) {
  const toast = useToast()
  const remove = useDeleteInvoice()
  const can = useCan('invoice', 'delete', { clientId: invoice?.client_id })

  async function confirm() {
    if (!invoice || !can) return
    try {
      await remove.mutateAsync(invoice.id)
      toast({ title: `${invoice.number} deleted`, tone: 'ok' })
      onClose()
    } catch (error) {
      toast({ title: 'Could not delete the invoice', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(invoice)}
      onClose={onClose}
      title={`Delete ${invoice?.number ?? 'invoice'}?`}
      description="The invoice and its lines are removed, and the client no longer sees it."
      confirmLabel="Delete invoice"
      pending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
