import { useState } from 'react'
import { Button, Dialog, Field, Input } from '../ui'

export type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  pending?: boolean
  /** The user must type this exactly before the button turns on, e.g. a client's name. */
  requireText?: string
}

/** A destructive confirmation. Enter confirms once it is allowed, Esc cancels. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  // Remounting on open clears whatever was typed last time.
  return props.open ? <Inner {...props} /> : null
}

function Inner({ open, onClose, title, description, confirmLabel, onConfirm, pending = false, requireText }: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const allowed = !requireText || typed.trim() === requireText

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!allowed} loading={pending} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {requireText && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (allowed && !pending) void onConfirm()
          }}
        >
          <Field label={`Type ${requireText} to confirm`}>
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
          </Field>
        </form>
      )}
    </Dialog>
  )
}
