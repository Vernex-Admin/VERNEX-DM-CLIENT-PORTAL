import { useMemo, useState } from 'react'
import { CircleCheck, FileText, Film, Globe, Image as ImageIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { Button, Checkbox, Dialog, EmptyState, Pill, Skeleton, useToast } from '../../components/ui'
import { formatShortDate, istDay, istDaysBetween } from '../../lib/dates'
import { useCan } from '../../lib/permissions'
import {
  useActionItems,
  useApproveDeliverable,
  useCurrentProfile,
  useDeliverables,
  useProjects,
} from '../../lib/queries'
import type { Deliverable } from '../../types/db'

const KIND_ICON: Partial<Record<Deliverable['kind'], LucideIcon>> = {
  video: Film,
  document: FileText,
  report: FileText,
  web_page: Globe,
  software_build: Globe,
}

type Row = { deliverable: Deliverable; daysWaiting: number; overdue: boolean }

export default function ApprovalsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: profile } = useCurrentProfile()
  const inReview = useDeliverables({ status: 'in_review' })
  const projects = useProjects()
  const actions = useActionItems({ open: true })
  const approve = useApproveDeliverable()
  const canApprove = useCan('deliverable', 'approve', { clientId: profile?.client_id ?? undefined })
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)

  const projectNames = useMemo(
    () => Object.fromEntries((projects.data ?? []).map((project) => [project.id, project.name])),
    [projects.data],
  )

  const rows: Row[] = useMemo(() => {
    const now = new Date()
    const today = istDay(now)
    return (inReview.data ?? [])
      .map((deliverable) => {
        const since =
          (actions.data ?? []).find((item) => item.type === 'approval' && item.ref_id === deliverable.id)?.created_at ??
          deliverable.created_at
        return {
          deliverable,
          daysWaiting: Math.max(0, istDaysBetween(since, now)),
          overdue: deliverable.due_date !== null && deliverable.due_date < today,
        }
      })
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.daysWaiting - a.daysWaiting)
  }, [inReview.data, actions.data])

  const chosen = rows.filter((row) => selected.includes(row.deliverable.id))

  async function approveChosen() {
    setWorking(true)
    try {
      for (const row of chosen) await approve.mutateAsync(row.deliverable.id)
      toast({ title: "Nice, approved. We'll lock this in.", tone: 'ok' })
      setSelected([])
      setConfirming(false)
    } catch (error) {
      toast({ title: 'Could not approve', description: error instanceof Error ? error.message : undefined, tone: 'bad' })
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-16">
      <h1 className="text-[1.6rem] leading-tight">Approvals</h1>

      {inReview.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-card border border-rule bg-surface p-3">
              <Skeleton className="size-[64px] shrink-0" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CircleCheck} title="Nothing is waiting for you" description="You're all caught up." />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ deliverable, daysWaiting, overdue }) => {
            const bulk = canApprove && deliverable.bulk_approvable && !deliverable.is_final
            return (
              <li key={deliverable.id} className="flex items-center gap-3 rounded-card border border-rule bg-surface p-3">
                {bulk && (
                  <Checkbox
                    aria-label={`Select ${deliverable.title}`}
                    label=""
                    className="shrink-0 items-center justify-center !py-0 min-w-[44px] min-h-[44px]"
                    checked={selected.includes(deliverable.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, deliverable.id] : current.filter((id) => id !== deliverable.id),
                      )
                    }
                  />
                )}
                <Thumbnail deliverable={deliverable} />
                <div className="min-w-0 flex-1">
                  <Link to={`/deliverables/${deliverable.id}`} className="leading-snug font-medium hover:underline">
                    {deliverable.title}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    <span className="font-mono">v{deliverable.current_version}</span> · {projectNames[deliverable.project_id]}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                    {overdue && <Pill tone="bad">Overdue, was due {formatShortDate(deliverable.due_date as string)}</Pill>}
                    <span>
                      {daysWaiting === 0 ? 'Sent today' : `${daysWaiting} ${daysWaiting === 1 ? 'day' : 'days'} waiting`}
                    </span>
                  </p>
                </div>
                <Button size="sm" className="max-sm:hidden" onClick={() => navigate(`/deliverables/${deliverable.id}`)}>
                  Review
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 flex items-center justify-between gap-3 border-t border-rule bg-surface p-3 md:bottom-0 md:left-60 md:px-8">
          <p className="font-medium">{chosen.length} selected</p>
          <Button variant="success" onClick={() => setConfirming(true)}>
            Approve {chosen.length}
          </Button>
        </div>
      )}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Approve ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}?`}
        description="This confirms the work meets your needs."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="success" loading={working} onClick={approveChosen}>
              Approve {chosen.length}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-1">
          {chosen.map(({ deliverable }) => (
            <li key={deliverable.id}>
              {deliverable.title} <span className="font-mono text-sm text-ink-muted">v{deliverable.current_version}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}

function Thumbnail({ deliverable }: { deliverable: Deliverable }) {
  return (
    <div className="flex size-[64px] shrink-0 items-center justify-center overflow-hidden rounded-field border border-rule bg-paper">
      {deliverable.thumbnail_url ? (
        <img src={deliverable.thumbnail_url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Icon icon={KIND_ICON[deliverable.kind] ?? ImageIcon} size={22} className="text-ink-muted" />
      )}
    </div>
  )
}
