import { useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '../../data'
import type {
  ActionItemFilter,
  BrandAssetUpload,
  CommentFilter,
  CommentInput,
  FileFilter,
  FounderMessage,
  SocialMetricsFilter,
} from '../../data'
import type { ActionItem, ActionItemInsert, Comment, Feedback, FileRecord, Profile } from '../../types/db'
import { keys, R } from './keys'
import { nowIso, tempId, useOptimisticMutation } from './optimistic'

function useCurrentProfileId(): () => string {
  const queryClient = useQueryClient()
  return () => queryClient.getQueryData<Profile | null>(keys.detail(R.session, 'current'))?.id ?? ''
}

// --- Action items -----------------------------------------------------------

/** Pass `{ open: true }` for the "Action Required" banner. */
export function useActionItems(filter: ActionItemFilter = {}) {
  return useQuery({ queryKey: keys.list(R.actionItems, filter), queryFn: () => data.actionItems.list(filter) })
}

// `open` is not a column, so list membership needs its own rule.
const actionItemBelongs = (row: ActionItem, filter: Record<string, unknown>) =>
  (filter.client_id === undefined || row.client_id === filter.client_id) &&
  (filter.open === undefined || (row.resolved_at === null) === filter.open)

export function useCreateActionItem() {
  return useOptimisticMutation<ActionItem, ActionItemInsert>({
    resource: R.actionItems,
    mutationFn: (input) => data.actionItems.create(input),
    belongs: actionItemBelongs,
    change: (input) => ({
      type: 'create',
      row: {
        project_id: null,
        ref_type: null,
        ref_id: null,
        assigned_user_id: null,
        blocks_milestone: false,
        due_at: null,
        resolved_at: null,
        ...input,
        id: tempId(),
        created_at: nowIso(),
      },
    }),
  })
}

export function useResolveActionItem() {
  return useOptimisticMutation<ActionItem, string>({
    resource: R.actionItems,
    mutationFn: (id) => data.actionItems.resolve(id),
    belongs: actionItemBelongs,
    change: (id) => ({ type: 'patch', id, patch: { resolved_at: nowIso() } }),
  })
}

export function useDeleteActionItem() {
  return useOptimisticMutation<ActionItem, string, void>({
    resource: R.actionItems,
    mutationFn: (id) => data.actionItems.remove(id),
    change: (id) => ({ type: 'remove', id }),
  })
}

// --- Comments ---------------------------------------------------------------

/** Clients receive client-visible comments only; staff also receive internal ones. */
export function useComments(filter: CommentFilter | undefined) {
  return useQuery({
    queryKey: keys.list(R.comments, filter),
    queryFn: () => data.comments.list(filter as CommentFilter),
    enabled: Boolean(filter),
  })
}

export function useAddComment() {
  const authorId = useCurrentProfileId()
  return useOptimisticMutation<Comment, CommentInput>({
    resource: R.comments,
    mutationFn: (input) => data.comments.create(input),
    change: (input) => ({
      type: 'create',
      row: {
        id: tempId(),
        client_id: '',
        project_id: null,
        target_type: input.target_type,
        target_id: input.target_id,
        author_id: authorId(),
        body: input.body,
        visibility: input.visibility ?? 'client',
        created_at: nowIso(),
      },
    }),
  })
}

// --- Files (Brand Assets) ---------------------------------------------------

export function useFiles(filter: FileFilter | undefined) {
  return useQuery({
    queryKey: keys.list(R.files, filter),
    queryFn: () => data.files.list(filter as FileFilter),
    enabled: Boolean(filter),
  })
}

export function useUploadBrandAsset() {
  const uploaderId = useCurrentProfileId()
  return useOptimisticMutation<FileRecord, BrandAssetUpload>({
    resource: R.files,
    mutationFn: (input) => data.files.uploadBrandAsset(input),
    change: (input) => ({
      type: 'create',
      row: {
        id: tempId(),
        client_id: input.client_id,
        project_id: null,
        deliverable_id: null,
        folder: 'brand_assets',
        name: input.name,
        mime_type: input.mime_type ?? null,
        size_bytes: input.size_bytes ?? null,
        storage_key: '',
        version: 1,
        uploaded_by: uploaderId() || null,
        visibility: 'client',
        created_at: nowIso(),
      },
    }),
  })
}

export function useDeleteFile() {
  return useOptimisticMutation<FileRecord, string, void>({
    resource: R.files,
    mutationFn: (id) => data.files.remove(id),
    change: (id) => ({ type: 'remove', id }),
  })
}

// --- Founder Box ------------------------------------------------------------

/** The signed-in client user's own messages to the founder. */
export function useMyFounderMessages() {
  return useQuery({
    queryKey: keys.list(R.founderBox, { scope: 'mine' }),
    queryFn: () => data.founderBox.listMine(),
  })
}

/** Founder only: every Founder Box message, newest first. */
export function useFounderInbox() {
  return useQuery({
    queryKey: keys.list(R.founderBox, { scope: 'inbox' }),
    queryFn: () => data.founderBox.listInbox(),
  })
}

export function useSendFounderMessage() {
  const senderId = useCurrentProfileId()
  return useOptimisticMutation<Feedback, FounderMessage>({
    resource: R.founderBox,
    mutationFn: (input) => data.founderBox.send(input),
    change: (input) => ({
      type: 'create',
      row: {
        id: tempId(),
        client_id: '',
        kind: 'founder_box',
        founder_category: input.category,
        rating: null,
        subject: input.subject,
        message: input.message,
        status: 'new',
        submitted_by: senderId(),
        created_at: nowIso(),
        responded_at: null,
      },
    }),
  })
}

// --- Read-only --------------------------------------------------------------

/** Daily social metrics, oldest first. Defaults to the last 30 days. */
export function useSocialMetrics(filter: SocialMetricsFilter | undefined) {
  return useQuery({
    queryKey: keys.list(R.socialMetrics, filter),
    queryFn: () => data.socialMetrics.listDaily(filter as SocialMetricsFilter),
    enabled: Boolean(filter),
  })
}

/** Staff only. */
export function useLeads() {
  return useQuery({ queryKey: keys.list(R.leads), queryFn: () => data.leads.list() })
}
