import { ChevronRight, Circle, CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { detailsStatus } from '../lib/clientDetails'
import { useAgreements, useOnboardingGates } from '../lib/queries'
import type { Client } from '../types/db'
import { Icon } from './Icon'
import { Card, CardBody, CardHeader } from './ui'

type Step = { title: string; detail: string; done: boolean; to: string; action: string }

/**
 * The three things a new client does before work starts: their details, the agreement, and the
 * first invoice. Shown on the dashboard until all three are done. `readOnly` drops the links, for
 * Vernex's preview.
 */
export function GettingStarted({ client, readOnly = false }: { client: Client; readOnly?: boolean }) {
  const gates = useOnboardingGates(client.id)
  const agreements = useAgreements(client.id)
  if (gates.isPending || agreements.isPending || gates.isError) return null

  const status = detailsStatus(client)
  const waitingAgreement = (agreements.data ?? []).find((row) => row.status === 'awaiting_client_signature')
  const steps: Step[] = [
    {
      title: 'Fill in your details',
      detail:
        status === 'locked'
          ? 'Confirmed and locked by Vernex.'
          : status === 'submitted'
            ? 'Sent. Vernex is reviewing them.'
            : 'Your business, contact and billing details.',
      done: status === 'submitted' || status === 'locked',
      to: '/details',
      action: status === 'in_progress' ? 'Continue' : status === 'not_started' ? 'Start' : 'View',
    },
    {
      title: 'Sign your agreement',
      detail: gates.data.agreement_signed
        ? 'Signed.'
        : waitingAgreement
          ? 'Your agreement is ready to sign.'
          : 'Vernex will share it here once your details are in.',
      done: gates.data.agreement_signed,
      to: waitingAgreement ? `/agreements/${waitingAgreement.id}` : '/vault',
      action: waitingAgreement ? 'Review and sign' : 'Open Vault',
    },
    {
      title: 'Pay your first invoice',
      detail: gates.data.first_invoice_paid ? 'Paid. Thank you.' : 'Find it under Billing once it is issued.',
      done: gates.data.first_invoice_paid,
      to: '/billing',
      action: 'Open Billing',
    },
  ]
  if (steps.every((step) => step.done)) return null
  const done = steps.filter((step) => step.done).length

  return (
    <Card>
      <CardHeader title="Getting started" description={`${done} of ${steps.length} done. Work begins once all three are complete.`} />
      <CardBody className="p-0">
        <ol className="flex flex-col divide-y divide-rule">
          {steps.map((step, index) => (
            <li key={step.title} className="flex items-center gap-3 px-4 py-3">
              <Icon icon={step.done ? CircleCheck : Circle} size={20} className={step.done ? 'shrink-0 text-ok' : 'shrink-0 text-ink-muted'} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <span className="sr-only">{`Step ${index + 1}${step.done ? ', done' : ''}: `}</span>
                  {step.title}
                </p>
                <p className="text-sm text-ink-muted">{step.detail}</p>
              </div>
              {!step.done && !readOnly && (
                <Link to={step.to} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-medium text-signal lg:min-h-0">
                  {step.action}
                  <Icon icon={ChevronRight} size={14} />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  )
}
