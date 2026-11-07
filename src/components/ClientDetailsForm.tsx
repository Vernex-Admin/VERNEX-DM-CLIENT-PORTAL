import { groupBySection } from '../lib/clientDetails'
import type { ClientDetailField, DetailFieldType } from '../types/db'
import { Card, CardBody, CardHeader, Field, Input, Textarea } from './ui'

// The client details form: the client fills it in, Vernex edits it, and once it is locked the
// client sees the same answers read-only.

const INPUT_TYPE: Record<Exclude<DetailFieldType, 'textarea'>, string> = {
  text: 'text',
  email: 'email',
  phone: 'tel',
  url: 'url',
  number: 'text',
  date: 'date',
}

const INPUT_MODE: Partial<Record<DetailFieldType, 'email' | 'tel' | 'url' | 'numeric'>> = {
  email: 'email',
  phone: 'tel',
  url: 'url',
  number: 'numeric',
}

export type ClientDetailsFormProps = {
  fields: ClientDetailField[]
  values: Record<string, string>
  onChange?: (key: string, value: string) => void
  errors?: Record<string, string>
  readOnly?: boolean
}

export function ClientDetailsForm({ fields, values, onChange, errors = {}, readOnly = false }: ClientDetailsFormProps) {
  return (
    <div className="flex flex-col gap-4">
      {groupBySection(fields).map((group) => (
        <Card key={group.section}>
          <CardHeader title={group.section} />
          <CardBody>
            {readOnly ? (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {group.fields.map((item) => {
                  const value = (values[item.key] ?? '').trim()
                  return (
                    <div key={item.key} className={item.type === 'textarea' ? 'sm:col-span-2' : undefined}>
                      <dt className="text-sm text-ink-muted">{item.label}</dt>
                      <dd className={value ? 'whitespace-pre-wrap break-words' : 'text-ink-muted'}>{value || 'Not given'}</dd>
                    </div>
                  )
                })}
              </dl>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((item) => (
                  <Field
                    key={item.key}
                    label={item.label}
                    required={item.required}
                    hint={item.hint ?? undefined}
                    error={errors[item.key]}
                    className={item.type === 'textarea' ? 'sm:col-span-2' : undefined}
                  >
                    {item.type === 'textarea' ? (
                      <Textarea rows={3} value={values[item.key] ?? ''} onChange={(event) => onChange?.(item.key, event.target.value)} />
                    ) : (
                      <Input
                        type={INPUT_TYPE[item.type]}
                        inputMode={INPUT_MODE[item.type]}
                        value={values[item.key] ?? ''}
                        onChange={(event) => onChange?.(item.key, event.target.value)}
                      />
                    )}
                  </Field>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

/** Every field of the form, with an empty string for unanswered ones, as save_client_details expects. */
export function formValues(fields: ClientDetailField[], values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(fields.map((item) => [item.key, values[item.key] ?? '']))
}
