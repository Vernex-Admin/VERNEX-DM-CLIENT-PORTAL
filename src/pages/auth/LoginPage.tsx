import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { Button, Card, CardBody, Field, Input } from '../../components/ui'
import { ACCESS_REMOVED_MESSAGE, rememberReturnPath, takeAccessRemoved } from '../../lib/authMessages'
import { useCurrentProfile, useSignInWithIdentifier } from '../../lib/queries'
import { audienceOf } from '../../lib/permissions'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')
const identifierPattern = /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[a-z0-9-]{6,64})$/i

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentProfile = useCurrentProfile()
  const signIn = useSignInWithIdentifier()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accessRemoved] = useState(() => takeAccessRemoved())
  const [validation, setValidation] = useState<{ identifier?: string; password?: string }>({})
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: typeof validation = {}
    if (!identifier.trim()) next.identifier = 'Enter your Client Code or email.'
    else if (!identifierPattern.test(identifier.trim())) next.identifier = 'Enter a valid Client Code or email.'
    if (!password) next.password = 'Enter your password.'
    setValidation(next)
    setSubmitError('')
    if (Object.keys(next).length) return

    const from = (location.state as { from?: unknown } | null)?.from
    rememberReturnPath(typeof from === 'string' ? from : null)
    try {
      const value = identifier.trim()
      await signIn.mutateAsync({ identifier: value.includes('@') ? value.toLowerCase() : value.toUpperCase(), password })
      const result = await currentProfile.refetch()
      const audience = audienceOf(result.data)
      if (!audience) {
        setSubmitError('We could not find an active Vernex Hub profile for this account. Contact Vernex.')
        return
      }
      navigate(audience === 'staff' ? '/admin/clients' : '/', { replace: true })
    } catch (error) {
      setSubmitError(messageOf(error))
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-8 sm:px-6">
      <div className="w-full max-w-[26rem]">
        <div className="mb-5 flex justify-center sm:mb-7">
          <img
            src="/vernex-digital-marketing.png"
            alt="Vernex Digital Marketing"
            className="h-28 w-full max-w-[22rem] object-cover object-center sm:h-32"
          />
        </div>

        <Card className="border border-rule bg-surface">
          <CardBody className="flex flex-col gap-5 p-6 sm:p-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[1.75rem] leading-tight text-ink">Welcome back</h1>
              <p className="text-sm leading-relaxed text-ink-muted">Sign in to continue to your Vernex Hub.</p>
            </div>

            {accessRemoved && (
              <p role="alert" className="rounded-card border border-bad/20 bg-bad/10 p-3 text-sm text-bad">
                {ACCESS_REMOVED_MESSAGE}
              </p>
            )}

            {submitError && (
              <p role="alert" aria-live="polite" className="rounded-card border border-bad/20 bg-bad/10 p-3 text-sm text-bad">
                {submitError}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <Field label="Client Code or Email" required error={validation.identifier}>
                <div className="relative">
                  <Input
                    type="text"
                    name="identifier"
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    inputMode="text"
                    placeholder="Enter your Client Code or email"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value)
                      setValidation((current) => ({ ...current, identifier: undefined }))
                      setSubmitError('')
                    }}
                    className="pl-10"
                    required
                    aria-invalid={Boolean(validation.identifier)}
                  />
                  <Icon icon={KeyRound} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
                </div>
              </Field>

              <Field label="Password" required error={validation.password}>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setValidation((current) => ({ ...current, password: undefined }))
                      setSubmitError('')
                    }}
                    className="pl-10 pr-11"
                    required
                    aria-invalid={Boolean(validation.password)}
                  />
                  <Icon icon={Lock} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-field text-ink-muted hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    <Icon icon={showPassword ? EyeOff : Eye} size={17} />
                  </button>
                </div>
              </Field>

              <Button type="submit" variant="primary" loading={signIn.isPending} className="mt-1 w-full justify-center">
                Sign in
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-muted">
          Need help signing in? Contact your Vernex account manager.
        </p>
      </div>
    </main>
  )
}
