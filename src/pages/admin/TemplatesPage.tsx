import { useMemo, useState } from 'react'
import { Copy, Edit2, Mail, MessageSquare, Save, X } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Pill,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '../../components/ui'
import { formatShortDate } from '../../lib/dates'
import { formatINR } from '../../lib/money'
import { useCan } from '../../lib/permissions'
import {
  useAccountLead,
  useClients,
  useClientUsers,
  useCurrentProfile,
  useInvoices,
  useMessageTemplates,
  useUpdateMessageTemplate,
} from '../../lib/queries'
import type { MessageTemplate } from '../../types/db'

function fillMergeFields(text: string, fields: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{([a-z_]+)\}\}/g, (match, key) => {
    const val = fields[key]
    if (val !== null && val !== undefined && val.trim() !== '') {
      return val
    }
    return match
  })
}

export default function TemplatesPage() {
  const toast = useToast()
  const canEdit = useCan('template', 'edit')
  const templates = useMessageTemplates()
  const updateTemplate = useUpdateMessageTemplate()
  const clients = useClients()
  const { data: currentStaff } = useCurrentProfile()

  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')

  const selectedClient = useMemo(
    () => clients.data?.find((c) => c.id === selectedClientId),
    [clients.data, selectedClientId],
  )

  const clientUsers = useClientUsers(selectedClientId || undefined)
  const accountLead = useAccountLead(selectedClientId || undefined)
  const invoices = useInvoices(selectedClientId ? { client_id: selectedClientId } : undefined)

  const contactUser = useMemo(() => {
    const users = clientUsers.data ?? []
    return users.find((u) => u.role === 'client_admin') ?? users[0]
  }, [clientUsers.data])

  const latestUnpaidInvoice = useMemo(() => {
    const list = (invoices.data ?? []).filter((i) => i.status !== 'paid' && i.status !== 'void')
    return list.sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0]
  }, [invoices.data])

  const currentMonthName = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  }, [])

  const mergeMap: Record<string, string | null | undefined> = useMemo(() => {
    if (!selectedClient) {
      return {
        pm_name: currentStaff?.full_name,
        portal_link: typeof window !== 'undefined' ? window.location.origin : '',
        month: currentMonthName,
      }
    }
    return {
      client_name: selectedClient.name,
      contact_name: contactUser?.full_name,
      lead_name: accountLead.data?.full_name,
      pm_name: currentStaff?.full_name,
      portal_link: typeof window !== 'undefined' ? window.location.origin : '',
      invoice_number: latestUnpaidInvoice?.number,
      amount: latestUnpaidInvoice ? formatINR(latestUnpaidInvoice.total_minor) : undefined,
      due_date: latestUnpaidInvoice?.due_date ? formatShortDate(latestUnpaidInvoice.due_date) : undefined,
      month: currentMonthName,
    }
  }, [selectedClient, contactUser, accountLead.data, currentStaff, latestUnpaidInvoice, currentMonthName])

  function startEdit(template: MessageTemplate) {
    setEditingId(template.id)
    setEditTitle(template.title)
    setEditSubject(template.subject ?? '')
    setEditBody(template.body)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    try {
      await updateTemplate.mutateAsync({
        id,
        patch: {
          title: editTitle,
          subject: editSubject.trim() ? editSubject : null,
          body: editBody,
        },
      })
      toast({ title: 'Template saved', tone: 'ok' })
      setEditingId(null)
    } catch {
      toast({ title: 'Could not save template', tone: 'bad' })
    }
  }

  function copyText(text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied to clipboard', tone: 'ok' })
    })
  }

  if (templates.isPending || clients.isPending) {
    return (
      <div aria-busy="true" className="mx-auto flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (templates.isError) {
    return <QueryError what="message templates" onRetry={() => templates.refetch()} />
  }

  const items = templates.data ?? []
  const clientPhone = contactUser?.phone_e164 ?? ''
  const clientEmail = contactUser?.email ?? selectedClient?.billing_email ?? ''

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] leading-tight font-semibold">Message Templates</h1>
          <p className="text-sm text-ink-muted">11 playbook messages with client merge fields</p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="client-merge-picker" className="text-sm font-medium">
            Merge with client:
          </label>
          <Select
            id="client-merge-picker"
            className="w-56"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">None (raw template)</option>
            {clients.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {items.map((tpl) => {
          const isEditing = editingId === tpl.id
          const filledSubject = tpl.subject ? fillMergeFields(tpl.subject, mergeMap) : ''
          const filledBody = fillMergeFields(tpl.body, mergeMap)

          const waUrl = clientPhone
            ? `https://wa.me/${clientPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(filledBody)}`
            : undefined

          const mailtoUrl = clientEmail
            ? `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(filledSubject)}&body=${encodeURIComponent(filledBody)}`
            : undefined

          return (
            <Card key={tpl.id}>
              <CardHeader
                title={tpl.title}
                action={
                  <div className="flex items-center gap-2">
                    <Pill tone={tpl.channel === 'whatsapp' ? 'ok' : 'info'}>
                      {tpl.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                    </Pill>
                    {canEdit && !isEditing && (
                      <Button variant="ghost" onClick={() => startEdit(tpl)}>
                        <Icon icon={Edit2} size={15} />
                        Edit
                      </Button>
                    )}
                  </div>
                }
              />

              <CardBody className="flex flex-col gap-3">
                {isEditing ? (
                  <div className="flex flex-col gap-3">
                    <Field label="Template title" required>
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </Field>
                    {tpl.channel === 'email' && (
                      <Field label="Subject line">
                        <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                      </Field>
                    )}
                    <Field label="Body" required>
                      <Textarea
                        rows={8}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="font-mono text-sm"
                      />
                    </Field>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        loading={updateTemplate.isPending}
                        onClick={() => void saveEdit(tpl.id)}
                      >
                        <Icon icon={Save} size={15} />
                        Save changes
                      </Button>
                      <Button variant="ghost" onClick={cancelEdit}>
                        <Icon icon={X} size={15} />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {tpl.channel === 'email' && tpl.subject && (
                      <div className="rounded-card border border-rule bg-paper p-2.5 text-sm">
                        <span className="font-medium text-ink-muted">Subject: </span>
                        <span className="font-medium text-ink">{filledSubject}</span>
                      </div>
                    )}

                    <div className="rounded-card border border-rule bg-paper p-3 text-sm whitespace-pre-wrap font-sans leading-relaxed text-ink">
                      {filledBody}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-rule">
                      <Button variant="secondary" onClick={() => copyText(filledBody)}>
                        <Icon icon={Copy} size={15} />
                        Copy text
                      </Button>

                      {tpl.channel === 'whatsapp' ? (
                        waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-ok/40 bg-ok/10 px-4 text-sm font-medium text-ok transition-colors hover:bg-ok/20 lg:min-h-[36px]"
                          >
                            <Icon icon={MessageSquare} size={15} />
                            Send on WhatsApp
                          </a>
                        ) : (
                          <Button
                            variant="secondary"
                            disabled
                            title="Choose a client with a WhatsApp phone number"
                          >
                            <Icon icon={MessageSquare} size={15} />
                            Send on WhatsApp
                          </Button>
                        )
                      ) : mailtoUrl ? (
                        <a
                          href={mailtoUrl}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-info/40 bg-info/10 px-4 text-sm font-medium text-info transition-colors hover:bg-info/20 lg:min-h-[36px]"
                        >
                          <Icon icon={Mail} size={15} />
                          Open in email
                        </a>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled
                          title="Choose a client with an email address"
                        >
                          <Icon icon={Mail} size={15} />
                          Open in email
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

