import { useState } from 'react'
import type { FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { QueryError } from '../../components/QueryError'
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Pill, Select, Skeleton, Switch, Textarea, useToast } from '../../components/ui'
import type { Tone } from '../../components/ui'
import { formatDateTime } from '../../lib/dates'
import { FOUNDER_CATEGORY_LABEL } from '../../lib/labels'
import { useCan } from '../../lib/permissions'
import { useCurrentProfile, useMyFounderMessages, useSendFounderMessage } from '../../lib/queries'
import { FOUNDER_CATEGORIES } from '../../types/db'
import type { FeedbackStatus, FounderCategory } from '../../types/db'

const STATUS: Record<FeedbackStatus, { label: string; tone: Tone }> = {
  new: { label: 'Sent', tone: 'info' },
  acknowledged: { label: 'Seen', tone: 'info' },
  in_progress: { label: 'Being looked into', tone: 'warn' },
  resolved: { label: 'Replied', tone: 'ok' },
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export default function FounderBoxPage() {
  const messages = useMyFounderMessages()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-[1.6rem] leading-tight">Founder Box</h1>
        <p className="text-ink-muted">A private line to the founder of Vernex.</p>
      </div>

      <MessageForm />

      <section aria-labelledby="past-messages" className="flex flex-col gap-3">
        <h2 id="past-messages" className="text-[1.2rem]">
          Your messages
        </h2>
        {messages.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            {[0, 1].map((row) => (
              <div key={row} className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : messages.isError ? (
          <QueryError what="your messages" onRetry={() => messages.refetch()} />
        ) : messages.data.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="You haven't written to the founder yet"
            description="Praise, a worry or an idea: anything you send here goes straight to the founder."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {[...messages.data]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((message) => {
                const status = STATUS[message.status]
                return (
                  <li key={message.id} className="flex flex-col gap-1.5 rounded-card border border-rule bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="leading-snug font-medium">{message.subject}</p>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    <p className="text-ink-muted">{message.message}</p>
                    {message.reply && (
                      <div className="rounded-card border-l-4 border-ok bg-paper p-3">
                        <p className="text-sm text-ink-muted">Reply from Boss Anandaa</p>
                        <p>{message.reply}</p>
                      </div>
                    )}
                    <p className="text-sm text-ink-muted">
                      {[message.founder_category && FOUNDER_CATEGORY_LABEL[message.founder_category], formatDateTime(message.created_at)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                )
              })}
          </ul>
        )}
      </section>
    </div>
  )
}

function MessageForm() {
  const toast = useToast()
  const { data: profile } = useCurrentProfile()
  const send = useSendFounderMessage()
  const canSend = useCan('founder_box', 'create')

  const [category, setCategory] = useState<FounderCategory>('idea')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [keepPrivate, setKeepPrivate] = useState(true)
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({})
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = {
      subject: subject.trim() ? undefined : 'Add a subject.',
      message: message.trim().length >= 10 ? undefined : 'Write at least 10 characters.',
    }
    setErrors(next)
    if (next.subject || next.message) return
    try {
      await send.mutateAsync({ category, subject: subject.trim(), message: message.trim(), private_from_team: keepPrivate })
      setSent(true)
      setSubject('')
      setMessage('')
    } catch (error) {
      toast({ title: 'Could not send your message', description: messageOf(error), tone: 'bad' })
    }
  }

  if (profile && !canSend) {
    return <p className="text-ink-muted">Your account cannot write to the founder.</p>
  }

  if (sent) {
    return (
      <Card>
        <CardBody className="flex flex-col items-start gap-3" role="status">
          <h2 className="text-[1.2rem]">Message sent</h2>
          <p>Boss Anandaa will personally reply within 24 hours.</p>
          <Button onClick={() => setSent(false)}>Write another message</Button>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Write to the founder" />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Category">
            <Select value={category} onChange={(event) => setCategory(event.target.value as FounderCategory)}>
              {FOUNDER_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {FOUNDER_CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" required error={errors.subject}>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Message" required error={errors.message}>
            <Textarea rows={6} value={message} onChange={(event) => setMessage(event.target.value)} />
          </Field>
          <Switch
            label="Keep this private from my project team"
            checked={keepPrivate}
            onChange={(event) => setKeepPrivate(event.target.checked)}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={send.isPending}>
              Send to the founder
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
