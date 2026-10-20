import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import type { DocumentInsert, DocumentPatch, OnboardingItemPatch, TemplatePatch } from '../../data'
import type { ServiceType } from '../../types/db'
import { keys, R } from './keys'

export function useOnboarding(clientId: string | undefined) {
  return useQuery({
    queryKey: keys.list(R.onboarding, { client_id: clientId }),
    queryFn: () => data.onboarding.list(clientId as string),
    enabled: Boolean(clientId),
  })
}

export function useGenerateOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, service }: { clientId: string; service: ServiceType }) =>
      data.onboarding.generate(clientId, service),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(R.onboarding) })
      queryClient.invalidateQueries({ queryKey: keys.all(R.clients) })
    },
  })
}

export function useUpdateOnboardingItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: OnboardingItemPatch }) =>
      data.onboarding.updateItem(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all(R.onboarding) }),
  })
}

export function useSubmitOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ answers, doneItemIds }: { answers: Record<string, unknown>; doneItemIds?: string[] }) =>
      data.onboarding.submit(answers, doneItemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(R.onboarding) })
      queryClient.invalidateQueries({ queryKey: keys.all(R.clients) })
      queryClient.invalidateQueries({ queryKey: keys.all(R.session) })
    },
  })
}

export function useOnboardingGates(clientId: string | undefined) {
  return useQuery({
    queryKey: keys.detail(R.onboardingGates, clientId),
    queryFn: () => data.onboarding.gates(clientId as string),
    enabled: Boolean(clientId),
  })
}

export function useDocuments(clientId: string | undefined) {
  return useQuery({
    queryKey: keys.list(R.documents, { client_id: clientId }),
    queryFn: () => data.documents.list(clientId as string),
    enabled: Boolean(clientId),
  })
}

export function useCreateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DocumentInsert) => data.documents.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(R.documents) })
      queryClient.invalidateQueries({ queryKey: keys.all(R.onboardingGates) })
    },
  })
}

export function useUpdateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DocumentPatch }) => data.documents.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(R.documents) })
      queryClient.invalidateQueries({ queryKey: keys.all(R.onboardingGates) })
    },
  })
}

export function useRemoveDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => data.documents.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(R.documents) })
      queryClient.invalidateQueries({ queryKey: keys.all(R.onboardingGates) })
    },
  })
}

export function useMessageTemplates() {
  return useQuery({
    queryKey: keys.all(R.templates),
    queryFn: () => data.templates.list(),
  })
}

export function useUpdateMessageTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TemplatePatch }) => data.templates.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all(R.templates) }),
  })
}

