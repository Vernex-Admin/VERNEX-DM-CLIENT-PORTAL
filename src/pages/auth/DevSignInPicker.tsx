import { useState } from 'react'
import { Button, Field, Select } from '../../components/ui'
import { useSwitchableProfiles, useSwitchProfile } from '../../lib/queries'
import type { Profile } from '../../types/db'

const ROLE_LABEL: Record<Profile['role'], string> = {
  vernex_founder: 'founder',
  vernex_pm: 'PM',
  client_admin: 'client admin',
  client_member: 'client member',
}

function label(profile: Profile) {
  const note = profile.role === 'client_member' ? (profile.can_approve ? ', can approve' : ', cannot approve') : ''
  return `${profile.full_name} (${ROLE_LABEL[profile.role]}${note}) · ${profile.email}`
}

// Development only: render this behind `import.meta.env.DEV` so it is not in production builds.
export function DevSignInPicker() {
  const { data: profiles = [] } = useSwitchableProfiles()
  const signIn = useSwitchProfile()
  const [selected, setSelected] = useState('')
  const staff = profiles.filter((profile) => profile.client_id === null)
  const clients = profiles.filter((profile) => profile.client_id !== null)

  return (
    <form
      aria-label="Development sign-in"
      className="mt-4 flex flex-col gap-3 rounded-card border border-dashed border-ink-muted p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (selected) signIn.mutate(selected)
      }}
    >
      <Field label="Sign in as" hint="Development only. Not shown in production builds.">
        <Select value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Choose a seeded user</option>
          <optgroup label="Vernex team">
            {staff.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {label(profile)}
              </option>
            ))}
          </optgroup>
          <optgroup label="Clients">
            {clients.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {label(profile)}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <Button type="submit" disabled={!selected} loading={signIn.isPending}>
        Sign in as this user
      </Button>
    </form>
  )
}
