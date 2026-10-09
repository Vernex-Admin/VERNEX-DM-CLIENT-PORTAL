import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { QueryError } from '../../components/QueryError'
import { Button, Card, CardBody, EmptyState, Field, Input, Pill, Skeleton, Tabs, Textarea, useToast } from '../../components/ui'
import type { Tone } from '../../components/ui'
import { relativeTime } from '../../lib/dates'
import { useCan } from '../../lib/permissions'
import { useAiDrafts, useApproveAiDraft, useMarkAiDraftSent, useUpdateAiDraft } from '../../lib/queries'
import type { AiDraft, AiDraftKind, AiDraftStatus } from '../../types/db'

const STATUS: Record<AiDraftStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'warn' },
  approved: { label: 'Approved', tone: 'info' },
  sent: { label: 'Sent', tone: 'ok' },
}

const TABS: { id: AiDraftKind; label: string; empty: { title: string; description: string } }[] = [
  { id: 'weekly_summary', label: 'Weekly summaries', empty: { title: 'No weekly summaries yet', description: 'A summary for each client is drafted every Monday.' } },
  { id: 'outreach', label: 'Outreach drafts', empty: { title: 'No outreach drafts yet', description: 'Drafts for leads you move to Qualified appear here.' } },
]

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export default function AiDraftsPage() {
  const drafts = useAiDrafts()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[1.4rem] leading-tight">AI Drafts</h1>
        <p className="text-ink-muted">Sample text for now. Read it, edit it, then approve it. Nothing goes out until you send it yourself.</p>
      </div>

      {drafts.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-40 w-full" />
          ))}
        </div>
      ) : drafts.isError ? (
        <QueryError what="the drafts" onRetry={() => drafts.refetch()} />
      ) : (
        <Tabs
          label="Draft types"
          items={TABS.map((tab) => {
            const rows = drafts.data.filter((draft) => draft.kind === tab.id)
            return {
              id: tab.id,
              label: `${tab.label} (${rows.length})`,
              content:
                rows.length === 0 ? (
                  <EmptyState icon={Sparkles} title={tab.empty.title} description={tab.empty.description} />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {rows.map((draft) => (
                      <li key={draft.id}>
                        <DraftCard draft={draft} />
                      </li>
                    ))}
                  </ul>
                ),
            }
          })}
        />
      )}
    </div>
  )
}

function DraftCard({ draft }: { draft: AiDraft }) {
  const toast = useToast()
  const update = useUpdateAiDraft()
  const approve = useApproveAiDraft()
  const markSent = useMarkAiDraftSent()
  const canEdit = useCan('ai_draft', 'edit')
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [error, setError] = useState<string>()
  const editable = draft.status === 'draft' && canEdit
  const changed = title !== draft.title || body !== draft.body
  const status = STATUS[draft.status]

  async function save(): Promise<boolean> {
    if (!body.trim()) {
      setError('The text cannot be empty.')
      return false
    }
    setError(undefined)
    if (!changed) return true
    try {
      await update.mutateAsync({ id: draft.id, patch: { title: title.trim() || draft.title, body } })
      return true
    } catch (failure) {
      toast({ title: 'Could not save your edits', description: messageOf(failure), tone: 'bad' })
      return false
    }
  }

  async function onSave() {
    if (await save()) toast({ title: 'Edits saved', tone: 'ok' })
  }

  // Approving takes the text as it is on screen, so an edit is never left behind.
  async function onApprove() {
    if (!(await save())) return
    try {
      await approve.mutateAsync(draft.id)
      toast({ title: 'Draft approved', tone: 'ok' })
    } catch (failure) {
      toast({ title: 'Could not approve', description: messageOf(failure), tone: 'bad' })
    }
  }

  async function onSent() {
    try {
      await markSent.mutateAsync(draft.id)
      toast({ title: 'Marked as sent', tone: 'ok' })
    } catch (failure) {
      toast({ title: 'Could not mark as sent', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm text-ink-muted">
            {draft.subject} · updated {relativeTime(draft.updated_at)}
          </p>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        {editable ? (
          <>
            <Field label="Title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label={`Text for ${draft.title}`} error={error}>
              <Textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={!changed} loading={update.isPending} onClick={() => void onSave()} aria-label={`Save edits to ${draft.title}`}>
                Save edits
              </Button>
              <Button variant="primary" loading={approve.isPending} onClick={() => void onApprove()} aria-label={`Approve ${draft.title}`}>
                Approve
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[1.0667rem] leading-snug">{draft.title}</h2>
            <p className="whitespace-pre-wrap">{draft.body}</p>
            {draft.status === 'approved' && canEdit && (
              <div className="flex justify-end">
                <Button variant="primary" loading={markSent.isPending} onClick={() => void onSent()} aria-label={`Mark as sent: ${draft.title}`}>
                  Mark as sent
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
