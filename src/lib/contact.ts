/** `https://wa.me/...` link with the message already typed, so the client only has to press send. */
export function whatsappLink(input: {
  phoneE164: string
  lead: string
  user: string
  client: string
  project?: string | null
}): string {
  const about = input.project ? ` about ${input.project}` : ''
  const text = `Hi ${input.lead}, this is ${input.user} from ${input.client}${about}`
  return `https://wa.me/${input.phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

/** `https://wa.me/...` link carrying exactly `text`, for messages written in advance (reminders). */
export function whatsappTextLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

export const telLink = (phoneE164: string) => `tel:${phoneE164.replace(/[^\d+]/g, '')}`
