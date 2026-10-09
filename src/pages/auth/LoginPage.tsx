import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '../../components/Wordmark'
import { Button, Card, CardBody, Field, Input, Pill } from '../../components/ui'
import { useSignInWithOAuth, useSignInWithOtp, useVerifyOtp } from '../../lib/queries'
import type { Audience } from '../../lib/permissions'
import { DevSignInPicker } from './DevSignInPicker'

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
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const sendLink = useSignInWithOtp()
  const google = useSignInWithOAuth()
  const openLink = useVerifyOtp()

  const error = sendLink.error ?? google.error ?? openLink.error

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    google.reset()
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
                  <p className="text-ink-muted">
                    We sent a sign-in link to <span className="font-medium text-ink">{sentTo}</span>. Open it on this
                    device to sign in. It works once.
                  </p>
                </div>
                {import.meta.env.DEV && (
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
                  Use a different email
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-[1.5rem] leading-snug">{copy.heading}</h1>
                <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
                  <Field label="Email" error={error && !openLink.error ? messageOf(error) : undefined}>
                    <Input
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </Field>
                  <Button type="submit" variant="primary" loading={sendLink.isPending}>
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
                    google.mutate({ provider: 'google', email })
                  }}
                >
                  Continue with Google
                </Button>
              </>
            )}
          </CardBody>
        </Card>

        {import.meta.env.DEV && <DevSignInPicker />}

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
