import { useState } from 'react'
import { Inbox } from 'lucide-react'
import { QueryError } from '../../components/QueryError'
import { Button, EmptyState, Field, Pill, Select, Skeleton, Textarea, useToast } from '../../components/ui'
import type { Tone } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatDateTime, relativeTime } from '../../lib/dates'
import { FOUNDER_CATEGORY_LABEL } from '../../lib/labels'
import { useCan } from '../../lib/permissions'
import { useClients, useFounderInbox, useReplyToFounderMessage, useSetFounderMessageStatus } from '../../lib/queries'
import type { Feedback, FeedbackStatus } from '../../types/db'
import { NoAccess } from '../Status'

// Only the founder reads the Founder Box; a PM who opens the address sees the access page.
export default function FounderInboxPage() {
  const allowed = useCan('founder_inbox', 'view')
  return allowed ? <Inbox_ /> : <NoAccess />
}

// The three states the founder works with. `in_progress` rows from elsewhere still display.
const STATUSES: { value: FeedbackStatus; label: string; tone: Tone }[] = [
  { value: 'new', label: 'New', tone: 'warn' },
  { value: 'acknowledged', label: 'Acknowledged', tone: 'info' },
  { value: 'resolved', label: 'Resolved', tone: 'ok' },
]
const statusOf = (status: FeedbackStatus) =>
  STATUSES.find((row) => row.value === status) ?? { value: status, label: 'In progress', tone: 'info' as Tone }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

function Inbox_() {
  const inbox = useFounderInbox()
  const clients = useClients()
  const [picked, setPicked] = useState<string>()
  const names = Object.fromEntries((clients.data ?? []).map((client) => [client.id, client.name]))
  const selected = inbox.data?.find((row) => row.id === picked) ?? inbox.data?.[0]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[1.4rem] leading-tight">Founder Inbox</h1>
        <p className="text-ink-muted">Private messages from clients. Only you can see them.</p>
      </div>

      {inbox.isPending ? (
        <div aria-busy="true" className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : inbox.isError ? (
        <QueryError what="the Founder Inbox" onRetry={() => inbox.refetch()} />
      ) : inbox.data.length === 0 ? (
        <EmptyState icon={Inbox} title="No messages yet" description="When a client writes to you from their Founder Box it lands here." />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
          <ul aria-label="Messages" className="flex flex-col gap-2">
            {inbox.data.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  aria-current={message.id === selected?.id}
                  onClick={() => setPicked(message.id)}
                  className={cn(
                    'flex w-full flex-col gap-1 rounded-card border bg-surface p-3 text-left transition-colors duration-150 hover:bg-ink/5',
                    message.id === selected?.id ? 'border-ink' : 'border-rule',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="leading-snug font-medium">{message.subject}</span>
                    <Pill tone={statusOf(message.status).tone}>{statusOf(message.status).label}</Pill>
                  </span>
                  <span className="text-sm text-ink-muted">
                    {names[message.client_id] ?? 'A client'} · {relativeTime(message.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected && <Detail key={selected.id} message={selected} client={names[selected.client_id] ?? 'A client'} />}
        </div>
      )}
    </div>
  )
}

function Detail({ message, client }: { message: Feedback; client: string }) {
  const toast = useToast()
  const reply = useReplyToFounderMessage()
  const setStatus = useSetFounderMessageStatus()
  const canEdit = useCan('founder_inbox', 'edit')
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()

  async function send() {
    if (text.trim().length < 2) return setError('Write a reply first.')
    setError(undefined)
    try {
      await reply.mutateAsync({ id: message.id, text, status: message.status })
      setText('')
      toast({ title: 'Reply sent', description: `${client} will see it in their Founder Box.`, tone: 'ok' })
    } catch (failure) {
      toast({ title: 'Could not send the reply', description: messageOf(failure), tone: 'bad' })
    }
  }

  async function changeStatus(status: FeedbackStatus) {
    try {
      await setStatus.mutateAsync({ id: message.id, status })
      toast({ title: `Marked ${statusOf(status).label.toLowerCase()}`, tone: 'ok' })
    } catch (failure) {
      toast({ title: 'Could not change the status', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <article aria-label={message.subject ?? 'Message'} className="flex flex-col gap-4 rounded-card border border-rule bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.2rem] leading-snug">{message.subject}</h2>
          <p className="text-sm text-ink-muted">
            {[client, message.founder_category && FOUNDER_CATEGORY_LABEL[message.founder_category], formatDateTime(message.created_at)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {message.private_from_team && <p className="text-sm text-ink-muted">The client asked to keep this from their project team.</p>}
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Status
          <Select
            aria-label="Status"
            value={message.status}
            disabled={!canEdit}
            onChange={(event) => void changeStatus(event.target.value as FeedbackStatus)}
            className="w-44"
          >
            {message.status === 'in_progress' && <option value="in_progress">In progress</option>}
            {STATUSES.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </Select>
        </label>
      </header>

      <p className="whitespace-pre-wrap">{message.message}</p>

      {message.reply && (
        <section aria-label="Your reply" className="rounded-card border-l-4 border-ok bg-paper p-3">
          <p className="text-sm text-ink-muted">Your reply{message.responded_at ? ` · ${formatDateTime(message.responded_at)}` : ''}</p>
          <p className="whitespace-pre-wrap">{message.reply}</p>
        </section>
      )}

      {canEdit && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              event.currentTarget.requestSubmit()
            }
          }}
          className="flex flex-col gap-3"
        >
          <Field label={message.reply ? 'Reply again' : 'Reply'} error={error} hint="Ctrl+Enter sends.">
            <Textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={reply.isPending}>
              Send reply
            </Button>
          </div>
        </form>
      )}
    </article>
  )
}
