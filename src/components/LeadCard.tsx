import { MessageCircle, Phone } from 'lucide-react'
import { cn } from '../lib/cn'
import { telLink, whatsappLink } from '../lib/contact'
import type { Profile } from '../types/db'
import { Icon } from './Icon'
import { Avatar } from './ui'

const linkButton =
  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-card border border-rule bg-surface px-4 font-medium ' +
  'text-ink transition-colors duration-150 hover:bg-ink/5 active:bg-ink/10 lg:min-h-[36px]'

export type LeadCardProps = {
  lead: Profile
  /** The signed-in client user, named in the WhatsApp message. */
  userName: string
  clientName: string
  projectName?: string | null
}

/** The client's Vernex account lead, one tap from WhatsApp or a call. */
export function LeadCard({ lead, userName, clientName, projectName }: LeadCardProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={lead.full_name} src={lead.avatar_url ?? undefined} size="lg" />
        <div className="min-w-0">
          <p className="leading-snug font-medium">{lead.full_name}</p>
          <p className="text-sm text-ink-muted">Your account lead at Vernex</p>
        </div>
      </div>
      <p className="text-sm text-ink-muted">Replies in about 1 hour</p>
      {lead.phone_e164 && (
        <div className={cn('flex gap-2')}>
          <a
            className={linkButton}
            target="_blank"
            rel="noreferrer"
            href={whatsappLink({
              phoneE164: lead.phone_e164,
              lead: lead.full_name.split(' ')[0] ?? lead.full_name,
              user: userName,
              client: clientName,
              project: projectName,
            })}
          >
            <Icon icon={MessageCircle} size={16} />
            WhatsApp
          </a>
          <a className={linkButton} href={telLink(lead.phone_e164)}>
            <Icon icon={Phone} size={16} />
            Call
          </a>
        </div>
      )}
    </div>
  )
}
