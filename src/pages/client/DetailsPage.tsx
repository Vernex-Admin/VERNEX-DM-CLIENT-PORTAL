import { useState } from 'react'
import { Lock } from 'lucide-react'
import { ClientDetailsForm, formValues } from '../../components/ClientDetailsForm'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, Pill, Skeleton, useToast } from '../../components/ui'
import { DETAILS_STATUS, detailFieldsOf, detailsStatus, requiredProgress, validateDetails } from '../../lib/clientDetails'
import { formatDateTime } from '../../lib/dates'
import { useCan } from '../../lib/permissions'
import { useClient, useCurrentProfile, useSaveClientDetails } from '../../lib/queries'
import type { Client } from '../../types/db'

export default function DetailsPage() {
  const { data: profile } = useCurrentProfile()
  const client = useClient(profile?.client_id ?? undefined)

  if (client.isPending) {
    return (
      <div aria-busy="true" className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (client.isError) return <QueryError what="your details" error={client.error} onRetry={() => void client.refetch()} />
  // Remounts with fresh answers when Vernex locks, unlocks or edits them.
  return <DetailsForm key={`${client.data.id}-${client.data.details_locked_at ?? ''}`} client={client.data} />
}

function DetailsForm({ client }: { client: Client }) {
  const toast = useToast()
  const save = useSaveClientDetails()
  const canSubmit = useCan('client_details', 'submit', { clientId: client.id })
  const fields = detailFieldsOf(client)
  const status = detailsStatus(client)
  const locked = status === 'locked' || !canSubmit
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(client.details ?? {}) }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const progress = requiredProgress(fields, values)

  function change(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      const { [key]: _gone, ...rest } = current
      return rest
    })
    setDirty(true)
  }

  async function persist(submit: boolean) {
    const next = validateDetails(fields, values, submit)
    setErrors(next)
    if (Object.keys(next).length > 0) {
      toast({ title: submit ? 'A few details still need attention' : 'Check the highlighted details', tone: 'bad' })
      return
    }
    try {
      await save.mutateAsync({ client_id: client.id, values: formValues(fields, values), submit })
      setDirty(false)
      toast({
        title: submit ? 'Details sent to Vernex' : 'Details saved',
        description: submit ? 'We will review them and lock them once everything is in order.' : undefined,
        tone: 'ok',
      })
    } catch (error) {
      toast({ title: 'Could not save your details', description: error instanceof Error ? error.message : undefined, tone: 'bad' })
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.6rem] leading-tight">My details</h1>
          <p className="text-sm text-ink-muted">
            {locked
              ? 'These are the details Vernex has on record for you.'
              : 'Tell us about your business. We use these details for your agreement, invoices and campaigns.'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Pill tone={DETAILS_STATUS[status].tone}>{DETAILS_STATUS[status].label}</Pill>
          <span className="text-sm text-ink-muted">
            Client Code <span className="font-mono text-ink">{client.client_code}</span>
          </span>
        </div>
      </div>

      {status === 'locked' ? (
        <p role="status" className="flex items-start gap-2 rounded-card border border-rule bg-surface p-3 text-sm">
          <Icon icon={Lock} size={16} className="mt-0.5 shrink-0 text-ink-muted" />
          <span>
            Vernex locked these details on {formatDateTime(client.details_locked_at as string)}. To change anything, contact
            your account manager.
          </span>
        </p>
      ) : status === 'submitted' ? (
        <p role="status" className="rounded-card border border-info/30 bg-info/10 p-3 text-sm text-ink">
          You sent these details on {formatDateTime(client.details_submitted_at as string)}. You can still make changes
          until Vernex locks them.
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          {progress.done} of {progress.total} required details filled in. You can save and come back any time.
        </p>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!save.isPending && !locked) void persist(true)
        }}
        className="flex flex-col gap-6"
      >
        <ClientDetailsForm fields={fields} values={values} onChange={change} errors={errors} readOnly={locked} />

        {!locked && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button onClick={() => void persist(false)} disabled={save.isPending || !dirty}>
              Save for later
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {status === 'submitted' ? 'Send updated details' : 'Send to Vernex'}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
