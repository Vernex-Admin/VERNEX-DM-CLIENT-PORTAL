import { LogOut, User } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useCurrentProfile, useSignOut } from '../../lib/queries'
import type { Audience } from '../../lib/permissions'
import { LOGIN_PATH } from '../guards'
import { Avatar, DropdownMenu } from '../ui'
import type { MenuItem } from '../ui'

/** Avatar menu. Pass `profilePath` for audiences that have a Profile page. */
export function UserMenu({ audience, profilePath }: { audience: Audience; profilePath?: string }) {
  const { data: profile } = useCurrentProfile()
  const navigate = useNavigate()
  const signOut = useSignOut()
  if (!profile) return null

  const items: MenuItem[] = [
    ...(profilePath ? [{ id: 'profile', label: 'Profile', icon: User, onSelect: () => navigate(profilePath) }] : []),
    {
      id: 'sign-out',
      label: 'Sign out',
      icon: LogOut,
      onSelect: () => signOut.mutateAsync().then(() => navigate(LOGIN_PATH[audience], { replace: true })),
    },
  ]

  return (
    <DropdownMenu
      align="end"
      items={items}
      trigger={(props) => (
        <button
          type="button"
          aria-label={`Account menu for ${profile.full_name}`}
          className="inline-flex size-[44px] items-center justify-center rounded-full transition-colors duration-150 hover:bg-ink/5"
          {...props}
        >
          <Avatar name={profile.full_name} src={profile.avatar_url ?? undefined} />
        </button>
      )}
    />
  )
}
