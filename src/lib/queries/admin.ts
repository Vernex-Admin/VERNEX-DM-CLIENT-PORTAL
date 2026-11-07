import { useQuery } from '@tanstack/react-query'
import { data } from '../../data'
import type { AiDraft, Feedback, FeedbackStatus, Reminder } from '../../types/db'
import { keys, R } from './keys'
import { nowIso, useOptimisticMutation } from './optimistic'

// Staff-only resources: the WhatsApp outbox, the Founder inbox and AI drafts.

// --- Reminders --------------------------------------------------------------

export function useReminders() {
  return useQuery({ queryKey: keys.list(R.reminders), queryFn: () => data.reminders.list() })
}

export function useUpdateReminder() {
  return useOptimisticMutation<Reminder, { id: string; status: Reminder['status'] }>({
    resource: R.reminders,
    mutationFn: ({ id, status }) => data.reminders.update(id, { status }),
    change: ({ id, status }) => ({ type: 'patch', id, patch: { status, sent_at: status === 'sent' ? nowIso() : null } }),
  })
}

// --- AI drafts --------------------------------------------------------------

export function useAiDrafts() {
  return useQuery({ queryKey: keys.list(R.aiDrafts), queryFn: () => data.aiDrafts.list() })
}

export function useUpdateAiDraft() {
  return useOptimisticMutation<AiDraft, { id: string; patch: Partial<Pick<AiDraft, 'title' | 'body'>> }>({
    resource: R.aiDrafts,
    mutationFn: ({ id, patch }) => data.aiDrafts.update(id, patch),
    change: ({ id, patch }) => ({ type: 'patch', id, patch }),
  })
}

export function useApproveAiDraft() {
  return useOptimisticMutation<AiDraft, string>({
    resource: R.aiDrafts,
    mutationFn: (id) => data.aiDrafts.approve(id),
    change: (id) => ({ type: 'patch', id, patch: { status: 'approved' } }),
  })
}

export function useMarkAiDraftSent() {
  return useOptimisticMutation<AiDraft, string>({
    resource: R.aiDrafts,
    mutationFn: (id) => data.aiDrafts.markSent(id),
    change: (id) => ({ type: 'patch', id, patch: { status: 'sent' } }),
  })
}

// --- Founder inbox ----------------------------------------------------------

export function useReplyToFounderMessage() {
  return useOptimisticMutation<Feedback, { id: string; text: string; status: FeedbackStatus }>({
    resource: R.founderBox,
    mutationFn: ({ id, text }) => data.founderBox.reply(id, text),
    change: ({ id, text, status }) => ({
      type: 'patch',
      id,
      patch: { reply: text.trim(), responded_at: nowIso(), status: status === 'new' ? 'acknowledged' : status },
    }),
  })
}

export function useSetFounderMessageStatus() {
  return useOptimisticMutation<Feedback, { id: string; status: FeedbackStatus }>({
    resource: R.founderBox,
    mutationFn: ({ id, status }) => data.founderBox.setStatus(id, status),
    change: ({ id, status }) => ({ type: 'patch', id, patch: { status } }),
  })
}
