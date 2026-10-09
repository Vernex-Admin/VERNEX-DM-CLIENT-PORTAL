import { useState } from 'react'
import { Bell, CircleCheck, Ellipsis, FolderOpen, House, LayoutDashboard, LineChart, MessageSquarePlus, Receipt, User, Mail } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { cn } from '../../lib/cn'
import { useActionItems, useClient, useCurrentProfile } from '../../lib/queries'
import { Icon } from '../Icon'
import { Avatar, Badge, Drawer } from '../ui'
import { UserMenu } from './UserMenu'

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

const SIDEBAR: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/approvals', label: 'Approvals', icon: CircleCheck },
  { to: '/requests', label: 'Requests', icon: MessageSquarePlus },
  { to: '/vault', label: 'Vault', icon: FolderOpen },
  { to: '/performance', label: 'Performance', icon: LineChart },
  { to: '/billing', label: 'Billing', icon: Receipt },
]
const FOUNDER_BOX: NavItem = { to: '/founder-box', label: 'Founder Box', icon: Mail }

const TABS: NavItem[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/approvals', label: 'Approvals', icon: CircleCheck },
  { to: '/vault', label: 'Vault', icon: FolderOpen },
  { to: '/billing', label: 'Billing', icon: Receipt },
]
const MORE: NavItem[] = [
  { to: '/requests', label: 'Requests', icon: MessageSquarePlus },
  { to: '/performance', label: 'Performance', icon: LineChart },
  FOUNDER_BOX,
  { to: '/settings/profile', label: 'Profile', icon: User },
]

export function ClientShell() {
  const { data: profile } = useCurrentProfile()
  const { data: client } = useClient(profile?.client_id ?? undefined)
  const { data: openItems = [] } = useActionItems({ open: true })
  const [moreOpen, setMoreOpen] = useState(false)
  const approvals = openItems.filter((item) => item.type === 'approval').length

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-rule bg-surface px-4">
        <Link to="/" className="flex min-h-[44px] min-w-0 items-center gap-3">
          <Avatar name={client?.name ?? 'Client'} src={client?.logo_url ?? undefined} size="lg" />
          <span className="truncate font-display text-[1.1rem] font-semibold">{client?.name ?? ''}</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/approvals"
            aria-label={`Notifications, ${openItems.length} open`}
            className="relative inline-flex size-[44px] items-center justify-center rounded-full transition-colors duration-150 hover:bg-ink/5"
          >
            <Icon icon={Bell} size={20} />
            {openItems.length > 0 && (
              <Badge tone="signal" className="absolute top-0.5 right-0 h-[18px] min-w-[18px] text-[11px]">
                {openItems.length}
              </Badge>
            )}
          </Link>
          <UserMenu audience="client" profilePath="/settings/profile" />
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed top-16 bottom-0 left-0 hidden w-60 flex-col gap-1 border-r border-rule bg-surface p-3 md:flex"
      >
        {SIDEBAR.map((item) => (
          <SideLink key={item.to} item={item} count={item.to === '/approvals' ? approvals : 0} />
        ))}
        <div className="mt-auto border-t border-rule pt-3">
          <SideLink item={FOUNDER_BOX} count={0} />
        </div>
      </nav>

      <main className="px-4 pt-6 pb-24 md:ml-60 md:px-8 md:pb-10">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-rule bg-surface md:hidden"
      >
        {TABS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={tabClass}>
            <Icon icon={item.icon} size={20} />
            {item.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className={tabClass({ isActive: false })}>
          <Icon icon={Ellipsis} size={20} />
          More
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="flex flex-col">
          {MORE.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-[48px] items-center gap-3 border-b border-rule text-[1rem]"
              >
                <Icon icon={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  )
}

function tabClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[12px] font-medium',
    isActive ? 'text-signal' : 'text-ink-muted',
  )
}

function SideLink({ item, count }: { item: NavItem; count: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex min-h-[44px] items-center gap-3 rounded-card border-l-2 lg:min-h-[40px] px-3 text-[1rem] transition-colors duration-150',
          isActive ? 'border-signal bg-ink/5 font-medium' : 'border-transparent text-ink-muted hover:bg-ink/5 hover:text-ink',
        )
      }
    >
      <Icon icon={item.icon} />
      <span className="flex-1">{item.label}</span>
      {count > 0 && <Badge tone="signal">{count}</Badge>}
    </NavLink>
  )
}
