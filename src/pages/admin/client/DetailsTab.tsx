import { useState } from 'react'
import { ArrowDown, ArrowUp, Lock, LockOpen, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { ClientDetailsForm, formValues } from '../../../components/ClientDetailsForm'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, Card, CardBody, CardHeader, Checkbox, Input, Pill, Select, Skeleton, useToast } from '../../../components/ui'
import {
  DETAIL_FIELD_TYPE_LABEL,
  DETAILS_STATUS,
  STANDARD_DETAIL_FIELDS,
  detailFieldsOf,
  detailsStatus,
  fieldsError,
  newFieldKey,
  requiredProgress,
  validateDetails,
} from '../../../lib/clientDetails'
import { formatDateTime } from '../../../lib/dates'
import { useCan } from '../../../lib/permissions'
import { useClient, useSaveClientDetails, useSetDetailFields, useSetDetailsLocked, useStaff } from '../../../lib/queries'
import { DETAIL_FIELD_TYPES } from '../../../types/db'
import type { Client, ClientDetailField, DetailFieldType } from '../../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : undefined)

export function DetailsTab({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  if (client.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (client.isError) return <QueryError what="the client details" error={client.error} onRetry={() => void client.refetch()} />
  return <Details client={client.data} />
}

function Details({ client }: { client: Client }) {
  const [customising, setCustomising] = useState(false)
  const fieldsKey = JSON.stringify(client.detail_fields)
  return (
    <div className="flex flex-col gap-4">
      <StatusCard client={client} onCustomise={() => setCustomising(true)} customising={customising} />
      {customising ? (
        <FieldsEditor key={fieldsKey} client={client} onDone={() => setCustomising(false)} />
      ) : (
        // Remount with the saved answers whenever the form or the answers change underneath.
        <AnswersEditor key={`${fieldsKey}-${JSON.stringify(client.details)}`} client={client} />
      )}
    </div>
  )
}

function StatusCard({ client, onCustomise, customising }: { client: Client; onCustomise: () => void; customising: boolean }) {
  const toast = useToast()
  const setLocked = useSetDetailsLocked()
  const staff = useStaff()
  const canLock = useCan('client_details', 'lock', { clientId: client.id })
  const canEdit = useCan('client_details', 'edit', { clientId: client.id })
  const status = detailsStatus(client)
  const fields = detailFieldsOf(client)
  const progress = requiredProgress(fields, client.details ?? {})
  const lockedBy = staff.data?.find((person) => person.id === client.details_locked_by)?.full_name

  async function toggle(locked: boolean) {
    try {
      await setLocked.mutateAsync({ clientId: client.id, locked })
      toast({
        title: locked ? 'Details locked' : 'Details unlocked',
        description: locked ? 'The client can now only read them.' : 'The client can edit them again.',
        tone: 'ok',
      })
    } catch (error) {
      toast({ title: locked ? 'Could not lock the details' : 'Could not unlock the details', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <Card>
      <CardHeader
        title="Client details"
        description="The client fills these in from their portal. You can edit them at any time, change the form for this client, and lock it once it is complete."
        action={<Pill tone={DETAILS_STATUS[status].tone}>{DETAILS_STATUS[status].label}</Pill>}
      />
      <CardBody className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            Required details: {progress.done} of {progress.total}
          </li>
          <li className="text-ink-muted">
            {client.details_submitted_at ? `Sent by the client ${formatDateTime(client.details_submitted_at)}` : 'Not sent by the client yet'}
          </li>
          {client.details_locked_at && (
            <li className="text-ink-muted">
              Locked {formatDateTime(client.details_locked_at)}
              {lockedBy ? ` by ${lockedBy}` : ''}
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          {canLock &&
            (client.details_locked_at ? (
              <Button loading={setLocked.isPending} onClick={() => void toggle(false)}>
                <Icon icon={LockOpen} size={15} />
                Unlock for the client
              </Button>
            ) : (
              <Button variant="primary" loading={setLocked.isPending} onClick={() => void toggle(true)}>
                <Icon icon={Lock} size={15} />
                Lock details
              </Button>
            ))}
          {canEdit && !customising && <Button onClick={onCustomise}>Customise form</Button>}
        </div>
      </CardBody>
    </Card>
  )
}

function AnswersEditor({ client }: { client: Client }) {
  const toast = useToast()
  const save = useSaveClientDetails()
  const canEdit = useCan('client_details', 'edit', { clientId: client.id })
  const fields = detailFieldsOf(client)
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(client.details ?? {}) }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  async function submit() {
    // Vernex may save a partly filled form; only the format of each answer is checked.
    const next = validateDetails(fields, values, false)
    setErrors(next)
    if (Object.keys(next).length > 0 || !canEdit) return
    try {
      await save.mutateAsync({ client_id: client.id, values: formValues(fields, values) })
      setDirty(false)
      toast({ title: 'Client details saved', tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not save the details', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!save.isPending) void submit()
      }}
      className="flex flex-col gap-4"
    >
      <ClientDetailsForm
        fields={fields}
        values={values}
        errors={errors}
        readOnly={!canEdit}
        onChange={(key, value) => {
          setValues((current) => ({ ...current, [key]: value }))
          setErrors(({ [key]: _gone, ...rest }) => rest)
          setDirty(true)
        }}
      />
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty}>
            Save details
          </Button>
        </div>
      )}
    </form>
  )
}

const blankField = (taken: string[]): ClientDetailField => ({
  key: newFieldKey('field', taken),
  label: '',
  type: 'text',
  required: false,
  section: 'Other',
  hint: null,
})

/** Vernex changes the questions for this client only. */
function FieldsEditor({ client, onDone }: { client: Client; onDone: () => void }) {
  const toast = useToast()
  const setFields = useSetDetailFields()
  const [fields, setLocal] = useState<ClientDetailField[]>(() => detailFieldsOf(client))
  // New fields get their key from the label when saved, so it reads well in the data.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string>()

  const update = (index: number, patch: Partial<ClientDetailField>) => {
    setLocal((current) => current.map((item, at) => (at === index ? { ...item, ...patch } : item)))
    setError(undefined)
  }
  const move = (index: number, by: -1 | 1) =>
    setLocal((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(index + by, 0, item as ClientDetailField)
      return next
    })

  function add() {
    const item = blankField(fields.map((row) => row.key))
    setLocal((current) => [...current, item])
    setFresh((current) => new Set(current).add(item.key))
  }

  async function save(next: ClientDetailField[] | null, what: string) {
    try {
      await setFields.mutateAsync({ clientId: client.id, fields: next })
      toast({ title: what, tone: 'ok' })
      onDone()
    } catch (failure) {
      toast({ title: 'Could not save the form', description: messageOf(failure), tone: 'bad' })
    }
  }

  async function submit() {
    const taken = fields.filter((item) => !fresh.has(item.key)).map((item) => item.key)
    const named = fields.map((item) => {
      if (!fresh.has(item.key)) return item
      const key = newFieldKey(item.label || 'field', taken)
      taken.push(key)
      return { ...item, key }
    })
    const problem = fieldsError(named)
    setError(problem)
    if (problem) return
    await save(named, 'Form saved for this client')
  }

  return (
    <Card>
      <CardHeader
        title={`Form for ${client.name}`}
        description="Changes apply to this client only. Answers to a removed field are kept and come back if you add it again."
      />
      <CardBody className="flex flex-col gap-3">
        <ol className="flex flex-col divide-y divide-rule">
          {fields.map((item, index) => (
            <li key={item.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <Input
                aria-label={`Label of field ${index + 1}`}
                placeholder="Label"
                value={item.label}
                onChange={(event) => update(index, { label: event.target.value })}
              />
              <Select
                aria-label={`Type of ${item.label || `field ${index + 1}`}`}
                value={item.type}
                onChange={(event) => update(index, { type: event.target.value as DetailFieldType })}
              >
                {DETAIL_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DETAIL_FIELD_TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={`Section of ${item.label || `field ${index + 1}`}`}
                placeholder="Section"
                value={item.section}
                onChange={(event) => update(index, { section: event.target.value })}
              />
              <div className="flex items-center gap-1">
                <Checkbox
                  label="Required"
                  checked={item.required}
                  onChange={(event) => update(index, { required: event.target.checked })}
                  className="mr-2"
                />
                <Button size="sm" variant="ghost" aria-label={`Move ${item.label || 'field'} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <Icon icon={ArrowUp} size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${item.label || 'field'} down`}
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <Icon icon={ArrowDown} size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${item.label || 'field'}`}
                  onClick={() => setLocal((current) => current.filter((_, at) => at !== index))}
                >
                  <Icon icon={Trash2} size={14} />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={add}>
              <Icon icon={Plus} size={15} />
              Add field
            </Button>
            {client.detail_fields !== null && (
              <Button loading={setFields.isPending} onClick={() => void save(null, 'Standard form restored')}>
                <Icon icon={RotateCcw} size={15} />
                Use the standard form ({STANDARD_DETAIL_FIELDS.length} fields)
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={onDone}>Cancel</Button>
            <Button variant="primary" loading={setFields.isPending} onClick={() => void submit()}>
              Save form
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
