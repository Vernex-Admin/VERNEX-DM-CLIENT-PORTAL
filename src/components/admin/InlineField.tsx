import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Pencil } from 'lucide-react'
import { Icon } from '../Icon'
import { Button, Input } from '../ui'

export type InlineFieldProps = {
  label: string
  /** The text shown, and edited unless `editValue` says otherwise. */
  value: string
  /** What the input starts with when it differs from what is shown, e.g. rupees for a ₹ amount. */
  editValue?: string
  canEdit: boolean
  type?: 'text' | 'email' | 'number'
  /** Returns an error message, or nothing when the value is fine. */
  validate?: (next: string) => string | undefined
  /** Saves the new value. Rejecting keeps the editor open. */
  onSave: (next: string) => Promise<unknown>
}

/** A detail that turns into an input when you edit it. Enter saves, Esc cancels. */
export function InlineField({ label, value, editValue, canEdit, type = 'text', validate, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  function start() {
    setDraft(editValue ?? value)
    setError(undefined)
    setEditing(true)
  }

  async function save() {
    const next = draft.trim()
    const problem = validate?.(next)
    if (problem) return setError(problem)
    if (next === (editValue ?? value)) return setEditing(false)
    setSaving(true)
    try {
      await onSave(next)
      setEditing(false)
    } catch {
      // The caller has already told the user; keep the draft so nothing is lost.
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void save()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 border-b border-rule py-2.5 sm:flex-row sm:items-start sm:gap-4">
      <dt className="w-44 shrink-0 pt-1 text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={label}
                type={type}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                autoFocus
                aria-invalid={error ? true : undefined}
                className="max-w-sm flex-1"
              />
              <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>
                Save
              </Button>
              <Button size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
            {error && <p className="text-sm text-bad">{error}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={value ? '' : 'text-ink-muted'}>{value || 'Not set'}</span>
            {canEdit && (
              <button
                type="button"
                onClick={start}
                aria-label={`Edit ${label}`}
                className="inline-flex size-[44px] items-center lg:size-[32px] justify-center rounded-card text-ink-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
              >
                <Icon icon={Pencil} size={15} />
              </button>
            )}
          </div>
        )}
      </dd>
    </div>
  )
}
