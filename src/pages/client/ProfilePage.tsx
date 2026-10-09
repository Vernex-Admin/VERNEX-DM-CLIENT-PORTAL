import { useState } from 'react'
import type { FormEvent } from 'react'
import { QueryError } from '../../components/QueryError'
import { Button, Card, CardBody, CardHeader, Field, Input, Skeleton, Switch, useToast } from '../../components/ui'
import { useCurrentProfile, useUpdateMe } from '../../lib/queries'
import type { NotificationPrefs, Profile } from '../../types/db'

const PREFS: { key: keyof NotificationPrefs; label: string; description?: string }[] = [
  { key: 'email', label: 'Email', description: 'Updates sent to your email address.' },
  { key: 'whatsapp', label: 'WhatsApp', description: 'Updates sent to your WhatsApp number.' },
  { key: 'approvals', label: 'Work waiting for your approval' },
  { key: 'comments', label: 'Comments and replies' },
  { key: 'invoices', label: 'Invoices and payment reminders' },
  { key: 'weekly_report', label: 'Weekly performance report' },
]

// +91 then ten digits starting 6-9; spaces and dashes are ignored while typing.
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/
const toE164 = (value: string) => {
  const digits = value.replace(/[\s-]/g, '')
  if (digits === '') return ''
  if (digits.startsWith('+')) return digits
  return `+91${digits.replace(/^0+/, '')}`
}

export default function ProfilePage() {
  const profile = useCurrentProfile()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-[1.6rem] leading-tight">Profile</h1>
      {profile.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-4 rounded-card border border-rule bg-surface p-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : profile.isError ? (
        <QueryError what="your profile" onRetry={() => profile.refetch()} />
      ) : profile.data ? (
        <ProfileForm key={profile.data.id} profile={profile.data} />
      ) : (
        <p className="text-ink-muted">Sign in to see your profile.</p>
      )}
    </div>
  )
}

function ProfileForm({ profile }: { profile: Profile }) {
  const toast = useToast()
  const update = useUpdateMe()
  const [name, setName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone_e164 ?? '')
  const [prefs, setPrefs] = useState<NotificationPrefs>(profile.notification_prefs)
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const e164 = toE164(phone)
    const next = {
      name: name.trim() ? undefined : 'Enter your name.',
      phone: e164 === '' || INDIAN_MOBILE.test(e164) ? undefined : 'Enter a 10-digit Indian mobile number.',
    }
    setErrors(next)
    if (next.name || next.phone) return
    try {
      await update.mutateAsync({ full_name: name.trim(), phone_e164: e164 === '' ? null : e164, notification_prefs: prefs })
      setPhone(e164)
      toast({ title: 'Profile saved', tone: 'ok' })
    } catch (error) {
      toast({
        title: 'Could not save your profile',
        description: error instanceof Error ? error.message : undefined,
        tone: 'bad',
      })
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader title="About you" />
        <CardBody className="flex flex-col gap-4">
          <Field label="Name" required error={errors.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          </Field>
          <Field label="WhatsApp number" hint="We use this for WhatsApp updates. Example: +91 98765 43210" error={errors.phone}>
            <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" />
          </Field>
          <Field label="Email" hint="To change your email, ask your Vernex contact.">
            <Input value={profile.email} readOnly />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notifications" description="Choose how and when we get in touch." />
        <CardBody>
          <ul className="flex flex-col gap-3">
            {PREFS.map((pref) => (
              <li key={pref.key}>
                <Switch
                  label={
                    <span className="flex flex-col">
                      <span>{pref.label}</span>
                      {pref.description && <span className="text-sm text-ink-muted">{pref.description}</span>}
                    </span>
                  }
                  checked={prefs[pref.key]}
                  onChange={(event) => setPrefs((current) => ({ ...current, [pref.key]: event.target.checked }))}
                />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
