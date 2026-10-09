import { CircleCheck, FileUp, MessageSquare, PackageCheck, Pencil, Receipt } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { formatDateTime, relativeTime } from '../lib/dates'
import type { ActivityEvent, ActivityKind } from '../lib/queries'
import { Icon } from './Icon'

const ICON: Record<ActivityKind, LucideIcon> = {
  approval: CircleCheck,
  revision: Pencil,
  delivery: PackageCheck,
  comment: MessageSquare,
  file: FileUp,
  invoice: Receipt,
}

/** The last ten events, newest first, with times in IST. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return <p className="text-ink-muted">Nothing has happened yet.</p>
  return (
    <ul className="flex flex-col divide-y divide-rule">
      {events.slice(0, 10).map((event) => (
        <li key={event.id} className="flex items-start gap-3 py-2.5">
          <Icon icon={ICON[event.kind]} size={16} className="mt-1 shrink-0 text-ink-muted" />
          <div className="min-w-0 flex-1">
            {event.deliverable_id ? (
              <Link to={`/deliverables/${event.deliverable_id}`} className="leading-snug hover:underline">
                {event.text}
              </Link>
            ) : (
              <p className="leading-snug">{event.text}</p>
            )}
            <time dateTime={event.at} title={formatDateTime(event.at)} className="text-sm text-ink-muted">
              {relativeTime(event.at)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  )
}


