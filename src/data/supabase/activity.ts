import type { ActivityEvent, ActivityRepo } from '../types'
import { supabase } from './client'
import { rows } from './errors'

type Approved = { id: string; client_id: string; title: string; approved_by: string | null; approved_at: string }
type RevisionRow = { id: string; client_id: string; deliverable_id: string; requested_by: string; submitted_at: string }
type VersionRow = { id: string; client_id: string; deliverable_id: string; version: number; created_at: string }
type InvoiceRow = {
  id: string
  client_id: string
  number: string
  paid_at: string | null
  created_at: string
}
type CommentRow = {
  id: string
  client_id: string
  target_type: string
  target_id: string
  author_id: string
  created_at: string
}
type Person = { id: string; full_name: string; client_id: string | null }

export const activity: ActivityRepo = {
  /**
   * The latest approvals, change requests, new versions, invoices and comments the person can see
   * (row-level security does the hiding), newest first. Internal comments are never asked for.
   */
  async recent(filter = {}) {
    const limit = filter.limit ?? 10
    const sb = supabase()
    // One table's latest rows, narrowed to a client when the caller asked for one.
    const from = (table: string, columns: string) => {
      const query = sb.from(table).select(columns)
      return filter.client_id ? query.eq('client_id', filter.client_id) : query
    }

    const [approved, revisions, versions, invoices, comments] = await Promise.all([
      rows<Approved>(
        from('deliverables', 'id, client_id, title, approved_by, approved_at')
          .not('approved_at', 'is', null)
          .order('approved_at', { ascending: false })
          .limit(limit),
      ),
      rows<RevisionRow>(
        from('revisions', 'id, client_id, deliverable_id, requested_by, submitted_at')
          .order('submitted_at', { ascending: false })
          .limit(limit),
      ),
      rows<VersionRow>(
        from('deliverable_versions', 'id, client_id, deliverable_id, version, created_at')
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      rows<InvoiceRow>(
        from('invoices', 'id, client_id, number, paid_at, created_at')
          .neq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      rows<CommentRow>(
        from('comments', 'id, client_id, target_type, target_id, author_id, created_at')
          .eq('visibility', 'client')
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
    ])

    // Names for the sentences: deliverable titles and the people involved.
    const deliverableIds = new Set<string>([
      ...revisions.map((r) => r.deliverable_id),
      ...versions.map((v) => v.deliverable_id),
      ...comments.filter((c) => c.target_type === 'deliverable').map((c) => c.target_id),
    ])
    const personIds = new Set<string>([
      ...approved.flatMap((a) => (a.approved_by ? [a.approved_by] : [])),
      ...revisions.map((r) => r.requested_by),
      ...comments.map((c) => c.author_id),
    ])
    const [titles, people] = await Promise.all([
      deliverableIds.size
        ? rows<{ id: string; title: string }>(
            sb.from('deliverables').select('id, title').in('id', [...deliverableIds]),
          )
        : Promise.resolve([]),
      personIds.size
        ? rows<Person>(sb.from('profiles').select('id, full_name, client_id').in('id', [...personIds]))
        : Promise.resolve([]),
    ])
    const titleOf = (id: string) => titles.find((t) => t.id === id)?.title ?? 'a deliverable'
    // Client people by name, Vernex staff as "<first name> from Vernex".
    const actor = (id: string | null) => {
      const person = people.find((p) => p.id === id)
      if (!person) return 'Vernex'
      return person.client_id === null ? `${person.full_name.split(' ')[0]} from Vernex` : person.full_name
    }

    const events: ActivityEvent[] = [
      ...approved.map<ActivityEvent>((a) => ({
        id: `approved-${a.id}`,
        client_id: a.client_id,
        kind: 'approval',
        text: `${actor(a.approved_by)} approved ${a.title}`,
        at: a.approved_at,
        deliverable_id: a.id,
      })),
      ...revisions.map<ActivityEvent>((r) => ({
        id: `revision-${r.id}`,
        client_id: r.client_id,
        kind: 'revision',
        text: `${actor(r.requested_by)} asked for changes to ${titleOf(r.deliverable_id)}`,
        at: r.submitted_at,
        deliverable_id: r.deliverable_id,
      })),
      ...versions.map<ActivityEvent>((v) => ({
        id: `version-${v.id}`,
        client_id: v.client_id,
        kind: 'delivery',
        text:
          v.version > 1
            ? `Vernex delivered the changes to ${titleOf(v.deliverable_id)}`
            : `Vernex shared ${titleOf(v.deliverable_id)}`,
        at: v.created_at,
        deliverable_id: v.deliverable_id,
      })),
      ...invoices.map<ActivityEvent>((i) => ({
        id: `invoice-${i.id}`,
        client_id: i.client_id,
        kind: 'invoice',
        text: i.paid_at ? `Payment received for invoice ${i.number}` : `Invoice ${i.number} sent`,
        at: i.paid_at ?? i.created_at,
        deliverable_id: null,
      })),
      ...comments.map<ActivityEvent>((c) => ({
        id: `comment-${c.id}`,
        client_id: c.client_id,
        kind: 'comment',
        text:
          c.target_type === 'deliverable'
            ? `${actor(c.author_id)} commented on ${titleOf(c.target_id)}`
            : `${actor(c.author_id)} left a comment`,
        at: c.created_at,
        deliverable_id: c.target_type === 'deliverable' ? c.target_id : null,
      })),
    ]
    return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  },
}
