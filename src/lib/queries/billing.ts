import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import type { ClientFilter, InvoicePatch, InvoiceTemplateInput, ServiceRequestSubmission } from '../../data'
import type { Invoice, InvoiceInsert, InvoiceWithItems, ServiceRequest, Update } from '../../types/db'
import type { InvoiceDraftInput, InvoiceSettingsInput, PaymentStatusInput } from '../../types/invoiceDocument'
import type { DuplicateMode } from '../invoiceDocument'
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
        document: null,
        revision: 1,
        revision_of: null,
        superseded_by: null,
        issued_at: null,
        updated_at: nowIso(),
        created_at: nowIso(),
      },
    }),
  })
}

export function useUpdateInvoice() {
  return useOptimisticMutation<Invoice, { id: string; patch: InvoicePatch }>({
    resource: R.invoices,
    mutationFn: ({ id, patch }) => data.invoices.update(id, patch),
    change: ({ id, patch: { items, ...columns } }) => ({
      type: 'patch',
      id,
      patch: { ...columns, ...(items ? invoiceTotals(items) : {}) },
    }),
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

// --- Invoice Generator ------------------------------------------------------
// These wait for the server: it validates the document and computes the totals, so there is no
// optimistic guess to show first.

function useInvoiceMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.all(R.invoices) }),
        queryClient.invalidateQueries({ queryKey: keys.all(R.invoiceEvents) }),
        queryClient.invalidateQueries({ queryKey: keys.all(R.actionItems) }),
      ]),
  })
}

export function useSaveInvoiceDraft() {
  return useInvoiceMutation((input: InvoiceDraftInput) => data.invoices.saveDraft(input))
}

export function useIssueInvoice() {
  return useInvoiceMutation((id: string) => data.invoices.issue(id))
}

export function useReviseInvoice() {
  return useInvoiceMutation((id: string) => data.invoices.revise(id))
}

export function useDuplicateInvoice() {
  return useInvoiceMutation(({ id, mode }: { id: string; mode: DuplicateMode }) => data.invoices.duplicate(id, mode))
}

export function useSetInvoicePaymentStatus() {
  return useInvoiceMutation(({ id, input }: { id: string; input: PaymentStatusInput }) => data.invoices.setPaymentStatus(id, input))
}

/** Staff only: who changed what on an invoice, oldest first. */
export function useInvoiceEvents(id: string | undefined) {
  return useQuery({
    queryKey: keys.list(R.invoiceEvents, { invoice_id: id }),
    queryFn: () => data.invoices.events(id as string),
    enabled: Boolean(id),
  })
}

/** Staff only: company defaults and payment mode. */
export function useInvoiceSettings(enabled = true) {
  return useQuery({ queryKey: keys.all(R.invoiceSettings), queryFn: () => data.invoiceSettings.get(), enabled })
}

export function useSaveInvoiceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InvoiceSettingsInput) => data.invoiceSettings.save(input),
    onSuccess: (settings) => queryClient.setQueryData(keys.all(R.invoiceSettings), settings),
  })
}

export function useUploadInvoiceImage() {
  return useMutation({
    mutationFn: ({ kind, file }: { kind: 'logo' | 'qr'; file: File }) => data.invoiceSettings.uploadImage(kind, file),
  })
}

/** Viewable links for stored invoice images, keyed by path. Signed links last 15 minutes. */
export function useInvoiceImageUrls(paths: string[]) {
  const sorted = [...new Set(paths)].sort()
  return useQuery({
    queryKey: keys.list(R.invoiceImages, { paths: sorted }),
    queryFn: () => data.invoiceSettings.imageUrls(sorted),
    enabled: sorted.length > 0,
    staleTime: 10 * 60_000,
  })
}

export function useInvoiceTemplates(enabled = true) {
  return useQuery({ queryKey: keys.all(R.invoiceTemplates), queryFn: () => data.invoiceSettings.templates(), enabled })
}

export function useSaveInvoiceTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InvoiceTemplateInput) => data.invoiceSettings.saveTemplate(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all(R.invoiceTemplates) }),
  })
}

export function useRemoveInvoiceTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => data.invoiceSettings.removeTemplate(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all(R.invoiceTemplates) }),
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
        desired_date: input.desired_date ?? null,
        attachment_names: input.attachment_names ?? [],
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
