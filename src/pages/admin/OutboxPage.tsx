import { MessageCircle, Send } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, EmptyState, Pill, Skeleton, Table, useToast } from '../../components/ui'
import type { Column, Tone } from '../../components/ui'
import { whatsappTextLink } from '../../lib/contact'
import { formatDateTime } from '../../lib/dates'
import { useCan } from '../../lib/permissions'
import { useReminders, useUpdateReminder } from '../../lib/queries'
import type { Reminder, ReminderStatus } from '../../types/db'

const STATUS: Record<ReminderStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'warn' },
  sent: { label: 'Sent', tone: 'ok' },
  skipped: { label: 'Skipped', tone: 'neutral' },
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export default function OutboxPage() {
  const reminders = useReminders()

  const columns: Column<Reminder>[] = [
    {
      key: 'to',
      header: 'To',
      cell: (row) => (
        <span>
          <span className="font-medium">{row.recipient_name}</span>
          <span className="block text-ink-muted">{row.phone_e164}</span>
        </span>
      ),
    },
    {
      key: 'message',
      header: 'Reminder',
      cell: (row) => (
        <span>
          <span className="font-medium">{row.reason}</span>
          <span className="block max-w-prose text-ink-muted">{row.message}</span>
        </span>
      ),
    },
    { key: 'due', header: 'Due', cell: (row) => formatDateTime(row.due_at) },
    { key: 'status', header: 'Status', cell: (row) => <Pill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Pill> },
    { key: 'actions', header: 'Actions', cell: (row) => <RowActions reminder={row} /> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[1.4rem] leading-tight">Outbox</h1>
        <p className="text-ink-muted">Reminders waiting for a person to send them. Nothing is sent automatically.</p>
      </div>

      {reminders.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      ) : reminders.isError ? (
        <QueryError what="the outbox" onRetry={() => reminders.refetch()} />
      ) : (
        <Table
          dense
          caption="Reminders"
          columns={columns}
          rows={reminders.data}
          rowKey={(row) => row.id}
          empty={<EmptyState icon={Send} title="The outbox is empty" description="Reminders for overdue invoices and waiting approvals will queue up here." />}
        />
      )}
    </div>
  )
}

function RowActions({ reminder }: { reminder: Reminder }) {
  const toast = useToast()
  const update = useUpdateReminder()
  const canEdit = useCan('reminder', 'edit')
  if (!canEdit) return null

  async function mark(status: ReminderStatus) {
    try {
      await update.mutateAsync({ id: reminder.id, status })
    } catch (error) {
      toast({ title: 'Could not update the reminder', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {/* The link opens WhatsApp with the text typed; the person still presses send there. */}
      <a
        href={whatsappTextLink(reminder.phone_e164, reminder.message)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Send on WhatsApp to ${reminder.recipient_name}: ${reminder.reason}`}
        onClick={() => {
          if (reminder.status === 'queued') void mark('sent')
        }}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-signal bg-signal px-3 text-sm font-medium text-surface transition-colors duration-150 hover:bg-signal/90 lg:min-h-[30px]"
      >
        <Icon icon={MessageCircle} size={15} />
        Send on WhatsApp
      </a>
      {reminder.status === 'queued' && (
        <Button size="sm" variant="ghost" aria-label={`Skip ${reminder.reason}`} onClick={() => void mark('skipped')}>
          Skip
        </Button>
      )}
    </span>
  )
}
