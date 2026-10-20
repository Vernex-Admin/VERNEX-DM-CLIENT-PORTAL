import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { Wordmark } from '../../components/Wordmark'
import { Button, Card, CardBody, Field, Input, Pill } from '../../components/ui'
import { ACCESS_REMOVED_MESSAGE, rememberReturnPath, takeAccessRemoved } from '../../lib/authMessages'
import { useSignInWithOAuth, useSignInWithOtp, useSignInWithPassword, useVerifyOtp } from '../../lib/queries'
import type { Audience } from '../../lib/permissions'

const COPY: Record<Audience, { heading: string; other: { text: string; label: string; to: string } }> = {
  client: {
    heading: 'Sign in to your portal',
    other: { text: 'Part of the Vernex team?', label: 'Sign in here', to: '/admin/login' },
  },
  staff: {
    heading: 'Sign in to Vernex Hub',
    other: { text: 'Signing in as a client?', label: 'Go to the client login', to: '/login' },
  },
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

export function LoginPage({ audience }: { audience: Audience }) {
  const copy = COPY[audience]
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState(() => (audience === 'staff' ? 'admin@vernex.in' : ''))
  const [password, setPassword] = useState(() => (audience === 'staff' ? 'admin@123' : ''))
  const [showPassword, setShowPassword] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [accessRemoved] = useState(() => takeAccessRemoved())

  const showDevVerify = import.meta.env.MODE === 'test'

  function rememberDestination() {
    const from = (location.state as { from?: unknown } | null)?.from
    rememberReturnPath(typeof from === 'string' ? from : null)
  }

  const signInPassword = useSignInWithPassword()
  const sendLink = useSignInWithOtp()
  const google = useSignInWithOAuth()
  const openLink = useVerifyOtp()

  const error = signInPassword.error ?? sendLink.error ?? google.error ?? openLink.error

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault()
    rememberDestination()
    try {
      await signInPassword.mutateAsync({ email: email.trim(), password })
      if (audience === 'staff') {
        navigate('/admin/clients')
      } else {
        navigate('/')
      }
    } catch {
      // Handled by react-query error state
    }
  }

  function handleSendLink() {
    google.reset()
    rememberDestination()
    sendLink.mutate({ email }, { onSuccess: () => setSentTo(email.trim()) })
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Wordmark />
          {audience === 'staff' && <Pill tone="neutral">Vernex team</Pill>}
        </div>

        <Card>
          <CardBody className="flex flex-col gap-4 p-5">
            {sentTo ? (
              <div className="flex flex-col gap-4" role="status">
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-[1.5rem] leading-snug">Check your email</h1>
                  <p className="text-sm text-ink-muted">
                    We sent a sign-in link to <span className="font-medium text-ink">{sentTo}</span>. Open it on this
                    device to sign in. It works once.
                  </p>
                </div>

                {showDevVerify && (
                  <Button
                    variant="primary"
                    loading={openLink.isPending}
                    onClick={() => openLink.mutate({ email: sentTo })}
                  >
                    Open the link (development)
                  </Button>
                )}

                {openLink.error && (
                  <p role="alert" className="text-sm text-bad">
                    {messageOf(openLink.error)}
                  </p>
                )}

                <Button
                  variant="ghost"
                  onClick={() => {
                    setSentTo(null)
                    openLink.reset()
                  }}
                >
                  Use username and password
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <h1 className="text-[1.5rem] leading-snug">{copy.heading}</h1>
                  {audience === 'staff' && (
                    <p className="text-xs text-ink-muted">
                      Admin credentials: <span className="font-mono text-ink">admin@vernex.in</span> / <span className="font-mono text-ink">admin@123</span>
                    </p>
                  )}
                </div>

                {accessRemoved && (
                  <p role="alert" className="rounded-card bg-bad/10 p-2 text-xs text-bad">
                    {ACCESS_REMOVED_MESSAGE}
                  </p>
                )}

                {error && !openLink.error && (
                  <p role="alert" className="rounded-card bg-bad/10 p-2 text-xs text-bad">
                    {messageOf(error)}
                  </p>
                )}

                <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3.5" noValidate>
                  <Field label="Email">
                    <div className="relative">
                      <Input
                        type="email"
                        name="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="pl-9"
                        required
                      />
                      <Icon icon={Mail} size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
                    </div>
                  </Field>

                  <Field label="Password">
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="pl-9 pr-9"
                        required
                      />
                      <Icon icon={Lock} size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-muted hover:text-ink focus:outline-none"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Icon icon={showPassword ? EyeOff : Eye} size={15} />
                      </button>
                    </div>
                  </Field>

                  <Button
                    type="submit"
                    variant="primary"
                    loading={signInPassword.isPending}
                    className="w-full justify-center"
                  >
                    {audience === 'staff' ? 'Sign In as Admin' : 'Sign In'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    loading={sendLink.isPending}
                    onClick={handleSendLink}
                    className="w-full justify-center text-xs"
                  >
                    Send me a sign-in link
                  </Button>
                </form>

                <div className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
                  <span className="h-px flex-1 bg-rule" />
                  or
                  <span className="h-px flex-1 bg-rule" />
                </div>

                <Button
                  loading={google.isPending}
                  onClick={() => {
                    sendLink.reset()
                    rememberDestination()
                    google.mutate({ provider: 'google', email })
                  }}
                  className="w-full justify-center"
                >
                  Continue with Google
                </Button>
              </>
            )}
          </CardBody>
        </Card>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {copy.other.text}{' '}
          <Link to={copy.other.to} className="font-medium text-ink underline underline-offset-2">
            {copy.other.label}
          </Link>
        </p>
      </div>
    </main>
  )
}
