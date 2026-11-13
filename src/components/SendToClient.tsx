import { useState } from 'react'
import { Send } from 'lucide-react'
import { Icon } from './Icon'
import { Button, Field, Input, Select, useToast } from './ui'
import { useSenderCompany } from '../lib/brand'

/** The business WhatsApp number that sends documents to clients (both companies). */
export const SENDER_WHATSAPP = '+91 97899 12805'

/** "98765 43210" or "+91 98765-43210" -> "919876543210" (India assumed for 10 digits). */
const whatsappDigits = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

/**
 * Email + WhatsApp send box. Send opens a Gmail draft from the chosen company address and the
 * WhatsApp chat with the client, each with the message filled in, and downloads the PDF to attach.
 */
export function SendToClient(props: {
  /** "Invoice" or "Agreement": the email subject starts with it. */
  title: string
  /** What is attached, e.g. "the agreement for VNX - SCHOOL ERP PROJECT". */
  description: string
  /** Who the message greets; blank greets "Hello". */
  recipient: string
  download: () => Promise<void> | void
}) {
  const toast = useToast()
  const company = useSenderCompany()
  const [from, setFrom] = useState(company.emails[0] as string)
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    const to = email.trim()
    const phone = whatsappDigits(whatsapp)
    if (!to && !phone) return toast({ title: 'Enter the client email or WhatsApp number', tone: 'bad' })
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return toast({ title: 'Check the email address', tone: 'bad' })
    if (whatsapp.trim() && (phone.length < 11 || phone.length > 15)) return toast({ title: 'Check the WhatsApp number', tone: 'bad' })
    const greeting = props.recipient.trim() ? `Hello ${props.recipient.trim()},` : 'Hello,'
    const body = `${greeting}\n\nPlease find attached ${props.description} from ${company.name}.\n\nRegards,\n${company.name}\n${from}\n${SENDER_WHATSAPP}`
    const subject = `${props.title} - ${company.name}`
    // Opened first, inside the click, so the browser treats them as user actions.
    const open = (url: string) => {
      const tab = window.open(url, '_blank')
      if (tab) tab.opener = null
      return Boolean(tab)
    }
    // Gmail compose, signed in as the chosen sender address (authuser picks the account).
    const mailOpened = !to || open(`https://mail.google.com/mail/?authuser=${encodeURIComponent(from)}&view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
    const chatOpened = !phone || open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`)
    if (!mailOpened || !chatOpened) {
      toast({ title: 'The browser blocked a window', description: 'Click the pop-up icon at the right of the address bar, choose "Always allow", then press Send again.', tone: 'bad' })
    }
    setBusy(true)
    try {
      await props.download()
      toast({ title: 'PDF downloaded', description: 'Attach it in the email and WhatsApp chat, then press send.', tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not create the PDF', description: error instanceof Error ? error.message : undefined, tone: 'bad' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-print flex flex-col gap-3 rounded-card border border-rule bg-surface p-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Send to client</h2>
        <p className="text-xs text-ink-muted">Email is sent from the address you choose; WhatsApp from {SENDER_WHATSAPP}.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Send email from">
          <Select value={from} onChange={(event) => setFrom(event.target.value)}>
            {company.emails.map((address) => <option key={address} value={address}>{address}</option>)}
          </Select>
        </Field>
        <Field label="Send to email">
          <Input type="email" placeholder="client@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Send to WhatsApp number">
          <Input type="tel" placeholder="+91 98765 43210" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
        </Field>
        <Button variant="primary" loading={busy} onClick={() => void send()} className="gap-1.5">
          <Icon icon={Send} size={15} />
          Send
        </Button>
      </div>
    </div>
  )
}
