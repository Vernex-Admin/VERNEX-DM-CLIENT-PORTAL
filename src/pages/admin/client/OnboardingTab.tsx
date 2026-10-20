import { useMemo, useState } from 'react'
import { Check, CheckCircle2, Circle, ListFilter } from 'lucide-react'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, Card, CardBody, CardHeader, Pill, Skeleton, useToast } from '../../../components/ui'
import { cn } from '../../../lib/cn'
import { formatShortDate, istDay } from '../../../lib/dates'
import { useCan } from '../../../lib/permissions'
import {
  useGenerateOnboarding,
  useOnboarding,
  useOnboardingGates,
  useUpdateOnboardingItem,
} from '../../../lib/queries'
import type { OnboardingItem, ServiceType } from '../../../types/db'

export function OnboardingTab({ clientId }: { clientId: string }) {
  const toast = useToast()
  const onboarding = useOnboarding(clientId)
  const gates = useOnboardingGates(clientId)
  const generate = useGenerateOnboarding()
  const updateItem = useUpdateOnboardingItem()

  const canEdit = useCan('onboarding', 'edit', { clientId })
  const canCreate = useCan('onboarding', 'create', { clientId })

  const [selectedService, setSelectedService] = useState<ServiceType>('social')
  const [waitingOnClient, setWaitingOnClient] = useState(false)

  const items = useMemo(() => onboarding.data ?? [], [onboarding.data])
  const todayIso = istDay(new Date())

  const doneCount = items.filter((item) => item.status === 'done').length
  const totalCount = items.length
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const visibleItems = useMemo(() => {
    if (!waitingOnClient) return items
    return items.filter((item) => item.owner === 'client' && item.status !== 'done')
  }, [items, waitingOnClient])

  const stages = useMemo(() => {
    const list: { stage: string; items: OnboardingItem[] }[] = []
    const seen = new Set<string>()
    for (const item of visibleItems) {
      if (!seen.has(item.stage)) {
        seen.add(item.stage)
        list.push({
          stage: item.stage,
          items: visibleItems.filter((i) => i.stage === item.stage),
        })
      }
    }
    return list
  }, [visibleItems])

  async function handleToggle(item: OnboardingItem) {
    if (!canEdit) return
    const nextStatus = item.status === 'done' ? 'todo' : 'done'
    try {
      await updateItem.mutateAsync({
        id: item.id,
        patch: { status: nextStatus },
      })
    } catch {
      toast({ title: 'Could not update item', tone: 'bad' })
    }
  }

  async function handleCreateChecklist() {
    if (!canCreate) return
    try {
      await generate.mutateAsync({ clientId, service: selectedService })
      toast({ title: 'Onboarding checklist created', tone: 'ok' })
    } catch {
      toast({ title: 'Could not create checklist', tone: 'bad' })
    }
  }

  if (onboarding.isPending || gates.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (onboarding.isError) {
    return <QueryError what="onboarding checklist" onRetry={() => onboarding.refetch()} />
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader title="Create onboarding checklist" />
        <CardBody className="flex flex-col gap-4">
          <p className="text-ink-muted">
            No checklist generated yet. Choose the client service type to build the checklist from the playbook.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="service_type"
                value="social"
                checked={selectedService === 'social'}
                onChange={() => setSelectedService('social')}
                className="size-4"
              />
              <span className="font-medium">Social media</span>
              <span className="text-sm text-ink-muted">(Common + Social media checklist)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="service_type"
                value="website"
                checked={selectedService === 'website'}
                onChange={() => setSelectedService('website')}
                className="size-4"
              />
              <span className="font-medium">Website</span>
              <span className="text-sm text-ink-muted">(Common + Website checklist)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="service_type"
                value="both"
                checked={selectedService === 'both'}
                onChange={() => setSelectedService('both')}
                className="size-4"
              />
              <span className="font-medium">Both</span>
              <span className="text-sm text-ink-muted">(Common + Social + Website checklist)</span>
            </label>
          </div>
          <div>
            <Button
              variant="primary"
              loading={generate.isPending}
              disabled={!canCreate}
              onClick={() => void handleCreateChecklist()}
            >
              Create checklist
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  const agreementSigned = Boolean(gates.data?.agreement_signed)
  const firstInvoicePaid = Boolean(gates.data?.first_invoice_paid)
  const gatesPassed = agreementSigned && firstInvoicePaid

  return (
    <div className="flex flex-col gap-6">
      {/* Gate Banner */}
      <Card className={cn('border-2', gatesPassed ? 'border-ok/30 bg-ok/5' : 'border-signal/30 bg-signal/5')}>
        <CardBody className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon
                icon={agreementSigned ? CheckCircle2 : Circle}
                size={18}
                className={agreementSigned ? 'text-ok' : 'text-ink-muted'}
              />
              <span>Agreement signed</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon
                icon={firstInvoicePaid ? CheckCircle2 : Circle}
                size={18}
                className={firstInvoicePaid ? 'text-ok' : 'text-ink-muted'}
              />
              <span>First invoice paid</span>
            </div>
          </div>
          <div>
            {gatesPassed ? (
              <span className="text-[1.05rem] font-semibold text-ok">Ready to start</span>
            ) : (
              <span className="text-[1.05rem] font-semibold text-signal">Don&apos;t start work yet</span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Progress & Controls */}
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">Onboarding progress</span>
            <span className="text-sm text-ink-muted">
              ({doneCount} of {totalCount} done · {percent}%)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setWaitingOnClient((prev) => !prev)}
            className={cn(
              'inline-flex min-h-[36px] items-center gap-2 rounded-field border px-3 text-sm transition-colors',
              waitingOnClient
                ? 'border-signal bg-signal/10 font-medium text-signal'
                : 'border-rule bg-paper text-ink-muted hover:text-ink',
            )}
          >
            <Icon icon={ListFilter} size={15} />
            Waiting on client
          </button>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-rule">
          <div
            className="h-full bg-ink transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Checklist grouped by stage */}
      {stages.length === 0 ? (
        <Card>
          <CardBody className="p-8 text-center text-ink-muted">
            No items matching filter.
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {stages.map(({ stage, items: stageItems }) => (
            <Card key={stage}>
              <CardHeader
                title={stage}
                description={`${stageItems.filter((i) => i.status === 'done').length}/${stageItems.length} completed`}
              />
              <CardBody className="flex flex-col divide-y divide-rule p-0">
                {stageItems.map((item) => {
                  const isDone = item.status === 'done'
                  const isOverdue = !isDone && item.due_date && item.due_date < todayIso

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center justify-between gap-3 p-3 transition-colors hover:bg-paper/40',
                        isDone && 'opacity-70',
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => void handleToggle(item)}
                          className={cn(
                            'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-field border transition-colors',
                            isDone
                              ? 'border-ink bg-ink text-surface'
                              : 'border-ink-muted bg-surface hover:border-ink',
                          )}
                          aria-label={`Mark ${item.title} as ${isDone ? 'todo' : 'done'}`}
                        >
                          {isDone && <Icon icon={Check} size={13} />}
                        </button>
                        <div className="min-w-0">
                          <p className={cn('text-sm leading-snug', isDone && 'line-through text-ink-muted')}>
                            {item.title}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <Pill tone={item.owner === 'client' ? 'info' : 'neutral'}>
                          {item.owner === 'client' ? 'Client' : 'Vernex'}
                        </Pill>
                        {item.due_date && (
                          <span
                            className={cn(
                              'text-sm whitespace-nowrap',
                              isOverdue ? 'font-medium text-bad' : 'text-ink-muted',
                            )}
                          >
                            {isOverdue ? 'Overdue: ' : 'Due '}
                            {formatShortDate(item.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

