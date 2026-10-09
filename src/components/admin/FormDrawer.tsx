import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button, Drawer } from '../ui'

export type FormDrawerProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** True once the user has changed something; closing then asks first. */
  dirty: boolean
  onSubmit: () => void | Promise<void>
  submitLabel: string
  pending?: boolean
  submitDisabled?: boolean
  children: ReactNode
}

/**
 * A side drawer holding one form.
 * Enter in a field submits (Ctrl+Enter in a text area), Esc and the close button close it, and
 * closing with unsaved changes asks "Keep editing" or "Discard changes" instead of losing them.
 */
export function FormDrawer({
  open,
  onClose,
  title,
  description,
  dirty,
  onSubmit,
  submitLabel,
  pending = false,
  submitDisabled = false,
  children,
}: FormDrawerProps) {
  const formId = useId()
  const [warning, setWarning] = useState(false)

  // A dialog opens with focus on its Close button; a form is better started at its first field.
  // Runs after the child Drawer's own effect has opened the dialog.
  useEffect(() => {
    if (open) document.getElementById(formId)?.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]),select,textarea')?.focus()
  }, [open, formId])

  // The browser's own prompt covers a refresh or closing the tab.
  useEffect(() => {
    if (!open || !dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, dirty])

  function requestClose() {
    if (dirty && !pending) setWarning(true)
    else onClose()
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !pending) {
      event.preventDefault()
      event.currentTarget.requestSubmit()
    }
  }

  return (
    <Drawer
      open={open}
      onClose={requestClose}
      beforeClose={() => {
        if (dirty && !pending) {
          setWarning(true)
          return false
        }
        return true
      }}
      title={title}
      description={description}
      footer={
        warning ? (
          <>
            <p role="alert" className="flex-1 self-center text-sm text-ink">
              You have unsaved changes.
            </p>
            <Button onClick={() => setWarning(false)}>Keep editing</Button>
            <Button variant="danger" onClick={onClose}>
              Discard changes
            </Button>
          </>
        ) : (
          <>
            <Button onClick={requestClose}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" loading={pending} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </>
        )
      }
    >
      <form
        id={formId}
        noValidate
        onKeyDown={onKeyDown}
        onSubmit={(event) => {
          event.preventDefault()
          if (!pending) void onSubmit()
        }}
        className="flex flex-col gap-4"
      >
        {children}
      </form>
    </Drawer>
  )
}
