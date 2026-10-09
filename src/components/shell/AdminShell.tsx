import { Inbox, Send, Sparkles, SquareKanban, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink, Outlet, useSearchParams } from 'react-router'
import { cn } from '../../lib/cn'
import { useCan } from '../../lib/permissions'
import { useClients } from '../../lib/queries'
import { Icon } from '../Icon'
import { Wordmark } from '../Wordmark'
import { Pill, Select } from '../ui'
import { UserMenu } from './UserMenu'

type NavItem = { to: string; label: string; icon: LucideIcon; show: boolean }

export function AdminShell() {
  const canSeeLeads = useCan('lead', 'view')
  const canSeeInbox = useCan('founder_inbox', 'view')
  const { data: clients = [] } = useClients()
  const [params, setParams] = useSearchParams()

  const items: NavItem[] = [
    { to: '/admin/clients', label: 'Clients', icon: Users, show: true },
    { to: '/admin/pipeline', label: 'Pipeline', icon: SquareKanban, show: canSeeLeads },
    { to: '/admin/outbox', label: 'Outbox', icon: Send, show: true },
    { to: '/admin/founder-inbox', label: 'Founder Inbox', icon: Inbox, show: canSeeInbox },
    { to: '/admin/ai-drafts', label: 'AI Drafts', icon: Sparkles, show: true },
  ].filter((item) => item.show)

  function pickClient(id: string) {
    const next = new URLSearchParams(params)
    if (id) next.set('client', id)
    else next.delete('client')
    setParams(next)
  }

  return (
    <div className="min-h-dvh bg-paper text-[1rem] text-ink lg:text-[13px]">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-rule bg-surface px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Wordmark className="text-[1.15rem]" />
          <Pill tone="neutral">Vernex team</Pill>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="client-switcher">
            Client
          </label>
          <Select
            id="client-switcher"
            className="w-40 sm:w-56 lg:!min-h-[36px] lg:!text-[13px]"
            value={params.get('client') ?? ''}
            onChange={(event) => pickClient(event.target.value)}
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
          <UserMenu audience="staff" />
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed top-12 bottom-0 left-0 hidden w-48 flex-col gap-0.5 border-r border-rule bg-surface p-2 md:flex"
      >
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            <Icon icon={item.icon} size={16} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-b border-rule bg-surface px-2 py-1 md:hidden">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            <Icon icon={item.icon} size={16} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="p-4 md:ml-48">
        <Outlet />
      </main>
    </div>
  )
}

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex min-h-[44px] items-center gap-2 rounded-card px-2.5 lg:min-h-[32px] whitespace-nowrap transition-colors duration-150',
    isActive ? 'bg-ink/5 font-medium text-ink' : 'text-ink-muted hover:bg-ink/5 hover:text-ink',
  )
}
