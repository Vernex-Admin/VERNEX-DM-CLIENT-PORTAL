import { useState } from 'react'
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { generatePassword, passwordError } from '../../lib/credentials'
import { formatDateTime } from '../../lib/dates'
import { useCan } from '../../lib/permissions'
import { useIssueLogin } from '../../lib/queries'
import type { ClientCredential, Profile } from '../../types/db'
import { Icon } from '../Icon'
import { Button, Dialog, Field, Input, useToast } from '../ui'

// Pieces Client Management, the client's Login tab and New client share: showing a password,
// copying it, and setting up or resetting a login.

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

/** Copies text and says so. */
export function useCopy() {
  const toast = useToast()
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: `${what} copied`, tone: 'ok' })
    } catch {
      toast({ title: `Could not copy the ${what.toLowerCase()}`, description: 'Select it and copy it by hand.', tone: 'bad' })
    }
  }
}

export function CopyButton({ text, what }: { text: string; what: string }) {
  const copy = useCopy()
  return (
    <Button size="sm" variant="ghost" aria-label={`Copy ${what.toLowerCase()}`} onClick={() => void copy(text, what)}>
      <Icon icon={Copy} size={14} />
    </Button>
  )
}

/** A password, hidden until asked for, with a copy button. */
export function PasswordText({ password, label = 'password' }: { password: string; label?: string }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-sm" aria-label={shown ? undefined : `${label} hidden`}>
        {shown ? password : '••••••••'}
      </span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={shown ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={shown}
        onClick={() => setShown((value) => !value)}
      >
        <Icon icon={shown ? EyeOff : Eye} size={14} />
      </Button>
      <CopyButton text={password} what="Password" />
    </span>
  )
}

/** Who set the current password, and when. */
export function passwordSource(credential: Pick<ClientCredential, 'set_by' | 'updated_at'>): string {
  const when = formatDateTime(credential.updated_at)
  return credential.set_by === 'client' ? `Changed by the client, ${when}` : `Set by Vernex, ${when}`
}

/** Password input with a "generate" button. */
export function PasswordInput({
  value,
  onChange,
  error,
  label = 'Password',
  hint = 'At least 8 characters with letters and numbers. Share it with the client yourself.',
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  label?: string
  hint?: string
}) {
  return (
    <Field label={label} required hint={hint} error={error}>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          className="font-mono"
        />
        <Button onClick={() => onChange(generatePassword())} aria-label="Generate a new password">
          <Icon icon={RefreshCw} size={15} />
          Generate
        </Button>
      </div>
    </Field>
  )
}

/** The code and password to hand to the client, with one button to copy both. */
export function CredentialsSummary({ loginCode, password }: { loginCode: string; password: string }) {
  const copy = useCopy()
  return (
    <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-3">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <dt className="text-sm text-ink-muted">Client Code</dt>
        <dd className="font-mono text-[1.05rem] font-medium">{loginCode}</dd>
        <dd>
          <CopyButton text={loginCode} what="Client Code" />
        </dd>
        <dt className="text-sm text-ink-muted">Password</dt>
        <dd className="font-mono text-[1.05rem] font-medium break-all">{password}</dd>
        <dd>
          <CopyButton text={password} what="Password" />
        </dd>
      </dl>
      <Button
        size="sm"
        onClick={() =>
          void copy(`Vernex Hub sign-in\nClient Code: ${loginCode}\nPassword: ${password}\n${window.location.origin}/login`, 'Sign-in details')
        }
      >
        <Icon icon={Copy} size={14} />
        Copy sign-in details
      </Button>
    </div>
  )
}

/**
 * Sets up a person's login, or gives them a new password. Shows the code and password once saved
 * so they can be passed on.
 */
export function IssueLoginDialog({
  person,
  credential,
  onClose,
}: {
  person: Profile | undefined
  credential: ClientCredential | undefined
  onClose: () => void
}) {
  return person ? <IssueLoginInner person={person} credential={credential} onClose={onClose} /> : null
}

function IssueLoginInner({ person, credential, onClose }: { person: Profile; credential: ClientCredential | undefined; onClose: () => void }) {
  const toast = useToast()
  const issue = useIssueLogin()
  const canEdit = useCan('client_access', 'edit', { clientId: person.client_id ?? undefined })
  const [password, setPassword] = useState(generatePassword)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<ClientCredential>()
  const resetting = Boolean(credential)

  async function submit() {
    const problem = passwordError(password)
    setError(problem)
    if (problem || !canEdit) return
    try {
      const result = await issue.mutateAsync({ profile_id: person.id, password })
      setSaved(result)
      toast({ title: resetting ? 'Password changed' : 'Login set up', tone: 'ok' })
    } catch (failure) {
      toast({ title: resetting ? 'Could not change the password' : 'Could not set up the login', description: messageOf(failure), tone: 'bad' })
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={saved ? 'Share these sign-in details' : resetting ? `New password for ${person.full_name}` : `Set up login for ${person.full_name}`}
      description={
        saved
          ? 'The client signs in with this Client Code and password. They can change the password from their profile.'
          : resetting
            ? 'The current password stops working straight away.'
            : 'They will sign in with a Client Code and this password.'
      }
      footer={
        saved ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={issue.isPending} disabled={!canEdit} onClick={() => void submit()}>
              {resetting ? 'Change password' : 'Set up login'}
            </Button>
          </>
        )
      }
    >
      {saved ? (
        <CredentialsSummary loginCode={saved.login_code} password={saved.password} />
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!issue.isPending) void submit()
          }}
          className="flex flex-col gap-4"
        >
          {credential && (
            <p className="text-sm text-ink-muted">
              Client Code <span className="font-mono text-ink">{credential.login_code}</span> stays the same.
            </p>
          )}
          <PasswordInput
            value={password}
            onChange={(next) => {
              setPassword(next)
              setError(undefined)
            }}
            error={error}
          />
        </form>
      )}
    </Dialog>
  )
}
