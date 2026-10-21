import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import type { AgreementDraftInput, AgreementTemplateInput } from '../../data'
import { keys, R } from './keys'

export function useAgreements(clientId?: string) {
  return useQuery({
    queryKey: keys.list(R.agreements, { client_id: clientId }),
    queryFn: () => data.agreements.list(clientId),
  })
}

export function useAgreement(id?: string) {
  return useQuery({
    queryKey: keys.detail(R.agreements, id),
    queryFn: () => data.agreements.get(id as string),
    enabled: Boolean(id),
  })
}

export function useAgreementEvents(id?: string) {
  return useQuery({
    queryKey: keys.list('agreements', { id, events: true }),
    queryFn: () => data.agreements.events(id as string),
    enabled: Boolean(id),
  })
}

export function useAgreementTemplates() {
  return useQuery({ queryKey: keys.list('agreements', { templates: true }), queryFn: () => data.agreements.templates() })
}

function useAgreementMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all(R.agreements) }),
  })
}

export function useSaveAgreementTemplate() {
  return useAgreementMutation((input: AgreementTemplateInput) => data.agreements.saveTemplate(input))
}

export function useCreateAgreementDraft() {
  return useAgreementMutation((input: AgreementDraftInput) => data.agreements.createDraft(input))
}

export function useUpdateAgreementDraft() {
  return useAgreementMutation(({ id, title, content }: { id: string; title: string; content: AgreementDraftInput['content'] }) =>
    data.agreements.updateDraft(id, { title, content }))
}

export function useRequestFounderSignature() {
  return useAgreementMutation((id: string) => data.agreements.requestFounderSignature(id))
}

export function useFounderSignAndSend() {
  return useAgreementMutation(({ id, signature }: { id: string; signature: Blob }) => data.agreements.founderSignAndSend(id, signature))
}

export function useClientSignAgreement() {
  return useAgreementMutation(({ id, signature, consent, timeZone }: { id: string; signature: Blob; consent: boolean; timeZone: string }) =>
    data.agreements.clientSign(id, signature, consent, timeZone))
}

export function useCancelAgreement() {
  return useAgreementMutation((id: string) => data.agreements.cancel(id))
}

export function useGenerateFinalAgreementPdf() {
  return useAgreementMutation((id: string) => data.agreements.generateFinalPdf(id))
}
