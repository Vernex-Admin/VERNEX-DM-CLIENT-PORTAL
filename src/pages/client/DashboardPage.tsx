import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ActionBanner } from '../../components/ActionBanner'
import { ActivityFeed } from '../../components/ActivityFeed'
import { HealthPill } from '../../components/HealthPill'
import { KpiStrip } from '../../components/KpiStrip'
import { LeadCard } from '../../components/LeadCard'
import { MilestoneStepper } from '../../components/MilestoneStepper'
import { RevisionMeter } from '../../components/RevisionMeter'
import { Card, CardBody, CardHeader, Skeleton, Tabs } from '../../components/ui'
import { formatShortDate } from '../../lib/dates'
import { summariseKpis } from '../../lib/kpis'
import { milestonePercent } from '../../lib/progress'
import {
  useAccountLead,
  useActionItems,
  useActivity,
  useClient,
  useClientUsers,
  useCurrentProfile,
  useDeliverables,
  useMilestones,
  useProjects,
  useSocialMetrics,
} from '../../lib/queries'
import type { Deliverable, Project } from '../../types/db'

const WORKING_NOW: Deliverable['status'][] = ['in_progress', 'revision_requested']
const OPEN: Deliverable['status'][] = ['in_review', 'revision_requested', 'in_progress']

/** previewClientId is set when Vernex staff preview a client's dashboard: that client's data, read-only. */
export default function DashboardPage({ previewClientId }: { previewClientId?: string } = {}) {
  const { data: profile } = useCurrentProfile()
  const clientId = previewClientId ?? profile?.client_id ?? undefined
  const viewers = useClientUsers(previewClientId)
  const viewerName = previewClientId ? (viewers.data?.[0]?.full_name ?? 'your team') : (profile?.full_name ?? '')
  const scope = clientId ? { client_id: clientId } : {}
  const client = useClient(clientId)
  const actions = useActionItems({ open: true, ...scope })
  const projects = useProjects(scope)
  const deliverables = useDeliverables(scope)
  const lead = useAccountLead(clientId)
  const metrics = useSocialMetrics(clientId ? { client_id: clientId, days: 30 } : undefined)
  const activity = useActivity({ limit: 10, ...scope })

  const projectNames = useMemo(
    () => Object.fromEntries((projects.data ?? []).map((project) => [project.id, project.name])),
    [projects.data],
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="sr-only">Dashboard</h1>

      {actions.isPending ? <BannerSkeleton /> : <ActionBanner items={actions.data ?? []} projectNames={projectNames} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Project health" />
          <CardBody className="flex flex-col gap-3">
            {projects.isPending || actions.isPending ? (
              <HealthSkeleton />
            ) : (projects.data ?? []).length === 0 ? (
              <p className="text-ink-muted">No projects yet.</p>
            ) : (
              (projects.data ?? []).map((project) => {
                const approval = (actions.data ?? []).find(
                  (item) => item.type === 'approval' && item.project_id === project.id,
                )
                const waiting = project.health === 'in_review' && Boolean(approval)
                return (
                  <HealthPill
                    key={project.id}
                    status={project.health}
                    name={project.name}
                    waitingOnYou={waiting}
                    reason={waiting ? approval?.title : project.health_reason}
                    to={waiting ? '/approvals' : undefined}
                  />
                )
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Where your project is" />
          <CardBody>
            {projects.isPending || deliverables.isPending ? (
              <StepperSkeleton />
            ) : (
              <Pipeline projects={projects.data ?? []} deliverables={deliverables.data ?? []} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your account lead" />
          <CardBody>
            {lead.isPending || client.isPending ? (
              <LeadSkeleton />
            ) : lead.data && viewerName && client.data ? (
              <LeadCard
                lead={lead.data}
                userName={viewerName}
                clientName={client.data.name}
                projectName={(projects.data ?? [])[0]?.name}
              />
            ) : (
              <p className="text-ink-muted">Your account lead will appear here.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {metrics.isPending ? (
        <KpiSkeleton />
      ) : (metrics.data ?? []).length > 0 ? (
        <section aria-label="How your numbers are doing">
          <KpiStrip kpis={summariseKpis(metrics.data ?? [])} comparedWith="the 15 days before" />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Revisions left" />
          <CardBody className="flex flex-col gap-4">
            {deliverables.isPending ? (
              <MeterSkeleton />
            ) : (
              <Meters deliverables={deliverables.data ?? []} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Working on now" />
          <CardBody>
            {deliverables.isPending ? (
              <ListSkeleton rows={3} />
            ) : (
              <WorkingNow deliverables={deliverables.data ?? []} projectNames={projectNames} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          <CardBody>{activity.isPending ? <ListSkeleton rows={5} /> : <ActivityFeed events={activity.data ?? []} />}</CardBody>
        </Card>
      </div>
    </div>
  )
}

function Pipeline({ projects, deliverables }: { projects: Project[]; deliverables: Deliverable[] }) {
  const [selected, setSelected] = useState<string>()
  if (projects.length === 0) return <p className="text-ink-muted">No projects yet.</p>
  if (projects.length === 1) {
    return <ProjectStepper project={projects[0] as Project} deliverables={deliverables} />
  }
  return (
    <Tabs
      label="Projects"
      value={selected ?? projects[0]?.id}
      onValueChange={setSelected}
      items={projects.map((project) => ({
        id: project.id,
        label: project.name,
        content: <ProjectStepper project={project} deliverables={deliverables} />,
      }))}
    />
  )
}

function ProjectStepper({ project, deliverables }: { project: Project; deliverables: Deliverable[] }) {
  const milestones = useMilestones(project.id)
  if (milestones.isPending) return <StepperSkeleton />
  const rows = milestones.data ?? []
  if (rows.length === 0) return <p className="text-ink-muted">No milestones set yet.</p>
  return <MilestoneStepper milestones={rows} percentComplete={milestonePercent(rows, deliverables)} />
}

function Meters({ deliverables }: { deliverables: Deliverable[] }) {
  const active = deliverables
    .filter((row) => OPEN.includes(row.status))
    .sort((a, b) => b.revisions_used / b.revision_limit - a.revisions_used / a.revision_limit)
    .slice(0, 3)
  if (active.length === 0) return <p className="text-ink-muted">Nothing is open right now.</p>
  return (
    <>
      {active.map((row) => (
        <Link key={row.id} to={`/deliverables/${row.id}`} className="block rounded-field hover:bg-ink/5">
          <RevisionMeter title={row.title} used={row.revisions_used} limit={row.revision_limit} />
        </Link>
      ))}
    </>
  )
}

function WorkingNow({ deliverables, projectNames }: { deliverables: Deliverable[]; projectNames: Record<string, string> }) {
  const rows = deliverables.filter((row) => WORKING_NOW.includes(row.status)).slice(0, 5)
  if (rows.length === 0) return <p className="text-ink-muted">Nothing in progress at the moment.</p>
  return (
    <ul className="flex flex-col divide-y divide-rule">
      {rows.map((row) => (
        <li key={row.id} className="py-2.5 first:pt-0 last:pb-0">
          <p className="leading-snug">{row.title}</p>
          <p className="text-sm text-ink-muted">
            {[
              projectNames[row.project_id],
              row.status === 'revision_requested' ? 'Making your changes' : 'In progress',
              row.due_date ? `Due ${formatShortDate(row.due_date)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  )
}

// Skeletons are shaped like the blocks they stand in for.

function BannerSkeleton() {
  return (
    <div aria-busy="true" className="border-l-4 border-rule pl-4">
      <Skeleton className="h-6 w-64 max-w-full" />
      <div className="mt-3 flex flex-col gap-3">
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-[36px] w-[72px]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function HealthSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      {[0, 1].map((row) => (
        <div key={row} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="ml-[17px] h-3 w-52 max-w-full" />
        </div>
      ))}
    </div>
  )
}

function StepperSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 md:flex-row">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3 md:flex-1 md:flex-col">
          <Skeleton className="size-[24px] shrink-0 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LeadSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-[40px] rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-[44px] flex-1 lg:h-[36px]" />
        <Skeleton className="h-[44px] flex-1 lg:h-[36px]" />
      </div>
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div aria-busy="true" className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-rule bg-rule lg:grid-cols-4">
      {[0, 1, 2, 3].map((tile) => (
        <div key={tile} className="flex flex-col gap-2 bg-surface p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  )
}

function MeterSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
