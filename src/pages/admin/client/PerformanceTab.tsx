import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Icon } from '../../../components/Icon'
import { Button, Card, CardBody, CardHeader, Field, Input, useToast } from '../../../components/ui'
import { relativeTime } from '../../../lib/dates'
import { METRICS_TEMPLATE, METRIC_COLUMNS, parseMetricsCsv } from '../../../lib/metricsCsv'
import type { MetricsParse } from '../../../lib/metricsCsv'
import { useCan } from '../../../lib/permissions'
import { useImportSocialMetrics, useLastSyncedAt } from '../../../lib/queries'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

/** Staff add a client's daily social numbers from a CSV. The client sees them on their Performance page. */
export function PerformanceTab({ clientId }: { clientId: string }) {
  const toast = useToast()
  const canImport = useCan('social_metrics', 'create', { clientId })
  const synced = useLastSyncedAt(clientId)
  const importRows = useImportSocialMetrics()
  const [parsed, setParsed] = useState<MetricsParse | null>(null)
  const [fileName, setFileName] = useState('')

  async function choose(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setParsed(parseMetricsCsv(await file.text(), clientId))
  }

  function runImport() {
    if (!parsed || parsed.errors.length > 0 || parsed.rows.length === 0) return
    importRows.mutate(parsed.rows, {
      onSuccess: (count) => {
        toast({ title: `${count} ${count === 1 ? 'day' : 'days'} imported`, tone: 'ok' })
        setParsed(null)
        setFileName('')
      },
      onError: (error) => toast({ title: 'Could not import', description: messageOf(error), tone: 'bad' }),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.2rem] font-semibold">Performance numbers</h2>
        <p className="text-sm text-ink-muted">
          {synced.isSuccess
            ? synced.data
              ? `Last synced ${relativeTime(synced.data)}`
              : 'No data synced yet'
            : ' '}
        </p>
      </div>

      {canImport ? (
        <Card>
          <CardHeader
            title="Import CSV"
            description="One row per day and platform. Importing the same day again replaces it."
          />
          <CardBody className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              Columns: <span className="font-mono">{METRIC_COLUMNS.join(', ')}</span>. Ad spend is in rupees.
            </p>
            <pre className="overflow-x-auto rounded-card border border-rule bg-paper p-3 font-mono text-sm">
              {METRICS_TEMPLATE}
            </pre>
            <Field label="CSV file">
              <Input type="file" accept=".csv,text/csv" onChange={(event) => void choose(event.target.files?.[0])} />
            </Field>

            {parsed && parsed.errors.length > 0 && (
              <div role="alert" className="flex flex-col gap-1 text-bad">
                <p className="font-medium">Nothing was imported from {fileName}. Fix these and choose it again:</p>
                <ul className="list-disc pl-5 text-sm">
                  {parsed.errors.slice(0, 8).map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                  {parsed.errors.length > 8 && <li>and {parsed.errors.length - 8} more</li>}
                </ul>
              </div>
            )}
            {parsed && parsed.errors.length === 0 && (
              <p role="status" className="text-ink">
                {parsed.rows.length} {parsed.rows.length === 1 ? 'row' : 'rows'} ready to import from {fileName}.
              </p>
            )}

            <div>
              <Button
                variant="primary"
                loading={importRows.isPending}
                disabled={!parsed || parsed.errors.length > 0 || parsed.rows.length === 0}
                onClick={runImport}
              >
                <Icon icon={Upload} size={16} />
                Import
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <p className="text-ink-muted">Only Vernex staff can import numbers.</p>
      )}
    </div>
  )
}
