import { useMemo, useState } from 'react'
import { ChartLine } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { KpiStrip } from '../../components/KpiStrip'
import { QueryError } from '../../components/QueryError'
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatShortDate, relativeTime } from '../../lib/dates'
import { formatINR } from '../../lib/money'
import { chartPoints, performanceKpis, RANGES } from '../../lib/performance'
import type { Range } from '../../lib/performance'
import { useCurrentProfile, useLastSyncedAt, useSocialMetrics, useTopPosts } from '../../lib/queries'

const count = new Intl.NumberFormat('en-IN')
// Chart colours are tokens (tokens.css), never library defaults.
const INK = 'var(--ink)'
const SIGNAL = 'var(--signal)'
const MUTED = 'var(--ink-muted)'
const RULE = 'var(--rule)'

export default function PerformancePage() {
  const { data: profile } = useCurrentProfile()
  const clientId = profile?.client_id ?? undefined
  const [days, setDays] = useState<Range>(30)

  // Twice the range, so each KPI can be compared with the days before.
  const metrics = useSocialMetrics(clientId ? { client_id: clientId, days: days * 2 } : undefined)
  const posts = useTopPosts(clientId ? { client_id: clientId, days, limit: 5 } : undefined)
  const synced = useLastSyncedAt(clientId)

  const kpis = useMemo(() => performanceKpis(metrics.data ?? [], days), [metrics.data, days])
  const points = useMemo(() => chartPoints(metrics.data ?? [], days), [metrics.data, days])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.6rem] leading-tight">Performance</h1>
          {synced.data && <p className="text-sm text-ink-muted">Last synced {relativeTime(synced.data)}</p>}
        </div>
        <div role="group" aria-label="Date range" className="flex gap-1">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={range === days}
              onClick={() => setDays(range)}
              className={cn(
                'min-h-[44px] rounded-card border px-3 transition-colors duration-150 lg:min-h-[36px]',
                range === days ? 'border-ink bg-ink text-surface' : 'border-rule bg-surface text-ink hover:bg-ink/5',
              )}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>

      {metrics.isPending ? (
        <PerformanceSkeleton />
      ) : metrics.isError ? (
        <QueryError what="your numbers" onRetry={() => metrics.refetch()} />
      ) : points.length === 0 ? (
        <EmptyState
          icon={ChartLine}
          title="No numbers yet"
          description="Your first results appear here a day after your social accounts and ads are connected."
        />
      ) : (
        <>
          <section aria-label="Key numbers">
            <KpiStrip kpis={kpis} comparedWith={`the ${days} days before`} separate />
          </section>

          <Card>
            <CardHeader title="Ad spend vs leads" description="By day" />
            <CardBody>
              <div
                role="img"
                aria-label={`Line chart of daily ad spend and leads over the last ${days} days`}
                className="h-72 w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={RULE} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      stroke={MUTED}
                      tick={{ fill: MUTED, fontSize: 12 }}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      yAxisId="spend"
                      stroke={MUTED}
                      tick={{ fill: MUTED, fontSize: 12 }}
                      tickLine={false}
                      width={64}
                      tickFormatter={(value: number) => formatINR(value)}
                    />
                    <YAxis
                      yAxisId="leads"
                      orientation="right"
                      allowDecimals={false}
                      stroke={MUTED}
                      tick={{ fill: MUTED, fontSize: 12 }}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      labelFormatter={(label) => formatShortDate(String(label))}
                      formatter={(value, name) => (name === 'Ad spend' ? formatINR(Number(value)) : String(value))}
                      contentStyle={{ background: 'var(--surface)', border: `1px solid ${RULE}`, borderRadius: 6, boxShadow: 'none' }}
                      labelStyle={{ color: INK }}
                      cursor={{ stroke: MUTED }}
                    />
                    <Legend />
                    {/* Two lines told apart by colour and by dash, not by colour alone. */}
                    <Line yAxisId="spend" dataKey="spend" name="Ad spend" stroke={INK} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line
                      yAxisId="leads"
                      dataKey="leads"
                      name="Leads"
                      stroke={SIGNAL}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <Card>
        <CardHeader title="Top 5 posts by reach" description={`Published in the last ${days} days`} />
        <CardBody>
          {posts.isPending ? (
            <div aria-busy="true" className="flex flex-col gap-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : posts.isError ? (
            <QueryError what="your top posts" onRetry={() => posts.refetch()} />
          ) : posts.data.length === 0 ? (
            <p className="text-ink-muted">No posts were published in these {days} days.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-rule">
              {posts.data.map((post, index) => (
                <li key={post.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="w-5 shrink-0 font-mono text-ink-muted">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-snug">{post.title}</p>
                    <p className="text-sm text-ink-muted">
                      <span className="capitalize">{post.platform}</span> · {formatShortDate(post.published_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono">{count.format(post.reach)}</p>
                    <p className="text-sm text-ink-muted">reach</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function PerformanceSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 7 }, (_, tile) => (
          <div key={tile} className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}
