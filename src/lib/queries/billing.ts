import { useQuery } from '@tanstack/react-query'
import { data } from '../../data'
import type { ClientFilter, ServiceRequestSubmission } from '../../data'
import type { Invoice, InvoiceInsert, InvoiceWithItems, ServiceRequest, Update } from '../../types/db'
import { invoiceTotals } from '../money'
import { keys, R } from './keys'
import { nowIso, tempId, useOptimisticMutation } from './optimistic'

export function useInvoices(filter: ClientFilter = {}) {
  return useQuery({ queryKey: keys.list(R.invoices, filter), queryFn: () => data.invoices.list(filter) })
}

/** One invoice with its line items. */
export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(R.invoices, id),
    queryFn: () => data.invoices.get(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateInvoice() {
  return useOptimisticMutation<Invoice, InvoiceInsert, InvoiceWithItems>({
    resource: R.invoices,
    mutationFn: (input) => data.invoices.create(input),
    change: ({ items, ...input }) => ({
      type: 'create',
      row: {
        project_id: null,
        milestone_id: null,
        status: 'draft',
        ...input,
        ...invoiceTotals(items),
        id: tempId(),
        // The server assigns the number.
        number: '',
        currency: 'INR',
        amount_paid_minor: 0,
        paid_at: null,
        created_at: nowIso(),
      },
    }),
  })
}

export function useUpdateInvoice() {
  return useOptimisticMutation<Invoice, { id: string; patch: Update<Invoice> }>({
    resource: R.invoices,
    mutationFn: ({ id, patch }) => data.invoices.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}

export function useDeleteInvoice() {
  return useOptimisticMutation<Invoice, string, void>({
    resource: R.invoices,
    mutationFn: (id) => data.invoices.remove(id),
    change: (id) => ({ type: 'remove', id }),
    invalidate: [R.actionItems],
  })
}

// --- Service requests -------------------------------------------------------

export function useServiceRequests(filter: ClientFilter = {}) {
  return useQuery({
    queryKey: keys.list(R.serviceRequests, filter),
    queryFn: () => data.serviceRequests.list(filter),
  })
}

export function useSubmitServiceRequest() {
  return useOptimisticMutation<ServiceRequest, ServiceRequestSubmission>({
    resource: R.serviceRequests,
    mutationFn: (input) => data.serviceRequests.submit(input),
    change: (input) => ({
      type: 'create',
      row: {
        id: tempId(),
        client_id: input.client_id,
        project_id: input.project_id ?? null,
        title: input.title,
        description: input.description ?? null,
        status: 'submitted',
        quote_amount_minor: null,
        requested_by: null,
        created_at: nowIso(),
      },
    }),
  })
}

/** Staff quote, schedule or decline a request. */
export function useUpdateServiceRequest() {
  return useOptimisticMutation<ServiceRequest, { id: string; patch: Update<ServiceRequest> }>({
    resource: R.serviceRequests,
    mutationFn: ({ id, patch }) => data.serviceRequests.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}
