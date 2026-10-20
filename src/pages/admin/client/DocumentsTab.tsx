import { useState } from 'react'
import { ExternalLink, FileCheck, FileText, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { FormDrawer } from '../../../components/admin/FormDrawer'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  Pill,
  Select,
  Skeleton,
  useToast,
} from '../../../components/ui'
import { formatDate } from '../../../lib/dates'
import { isSafeLink } from '../../../lib/links'
import { useCan } from '../../../lib/permissions'
import {
  useCreateDocument,
  useDocuments,
  useRemoveDocument,
  useUpdateDocument,
} from '../../../lib/queries'
import type { ClientDocument, DocumentKind, DocumentStatus } from '../../../types/db'

export function DocumentsTab({ clientId }: { clientId: string }) {
  const toast = useToast()
  const documents = useDocuments(clientId)
  const create = useCreateDocument()
  const update = useUpdateDocument()
  const remove = useRemoveDocument()

  const canCreate = useCan('document', 'create', { clientId })
  const canEdit = useCan('document', 'edit', { clientId })
  const canDelete = useCan('document', 'delete', { clientId })

  const [addOpen, setAddOpen] = useState(false)
  const [kind, setKind] = useState<DocumentKind>('proposal')
  const [title, setTitle] = useState('')
  const [sourceType, setSourceType] = useState<'drive' | 'upload'>('drive')
  const [externalUrl, setExternalUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<DocumentStatus>('draft')

  function resetForm() {
    setKind('proposal')
    setTitle('')
    setSourceType('drive')
    setExternalUrl('')
    setFile(null)
    setStatus('draft')
  }

  async function handleAdd() {
    if (!title.trim()) return

    try {
      await create.mutateAsync({
        client_id: clientId,
        kind,
        title: title.trim(),
        // The mock keeps only a local link to an uploaded file; Supabase will store it in Storage.
        external_url:
          sourceType === 'drive' ? externalUrl.trim() || null : file ? URL.createObjectURL(file) : null,
        file: sourceType === 'upload' ? (file ?? undefined) : undefined,
        status,
        sent_at: status === 'sent' || status === 'signed' ? new Date().toISOString() : null,
        signed_at: status === 'signed' ? new Date().toISOString() : null,
      })
      toast({ title: 'Document added', tone: 'ok' })
      setAddOpen(false)
      resetForm()
    } catch {
      toast({ title: 'Could not add document', tone: 'bad' })
    }
  }

  async function handleMarkSent(doc: ClientDocument) {
    try {
      await update.mutateAsync({
        id: doc.id,
        patch: { status: 'sent', sent_at: new Date().toISOString() },
      })
      toast({ title: `${doc.title} marked as sent`, tone: 'ok' })
    } catch {
      toast({ title: 'Could not update document', tone: 'bad' })
    }
  }

  async function handleMarkSigned(doc: ClientDocument) {
    try {
      await update.mutateAsync({
        id: doc.id,
        patch: { status: 'signed', signed_at: new Date().toISOString() },
      })
      toast({ title: `${doc.title} marked as signed`, tone: 'ok' })
    } catch {
      toast({ title: 'Could not update document', tone: 'bad' })
    }
  }

  async function handleDelete(doc: ClientDocument) {
    if (!confirm(`Delete "${doc.title}"?`)) return
    try {
      await remove.mutateAsync(doc.id)
      toast({ title: `${doc.title} deleted`, tone: 'ok' })
    } catch {
      toast({ title: 'Could not delete document', tone: 'bad' })
    }
  }

  if (documents.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (documents.isError) {
    return <QueryError what="documents" onRetry={() => documents.refetch()} />
  }

  const items = documents.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[1.2rem] font-semibold">Documents</h2>
          <p className="text-sm text-ink-muted">Proposals, agreements, and contracts</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Link
              to={`/admin/clients/${clientId}/agreement`}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-card border border-rule px-3 text-sm font-medium hover:bg-ink/5"
            >
              <Icon icon={FileCheck} size={15} />
              Generate Agreement
            </Link>
            <Button
              variant="primary"
              onClick={() => {
                resetForm()
                setAddOpen(true)
              }}
            >
              <Icon icon={Plus} size={16} />
              Add document
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Add a proposal, agreement or contract by file upload or Google Drive link."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((doc) => (
            <Card key={doc.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-field border border-rule bg-paper">
                    <Icon icon={FileText} size={18} className="text-ink-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{doc.title}</h3>
                      <Pill tone={doc.kind === 'agreement' ? 'info' : 'neutral'}>
                        {doc.kind === 'proposal' ? 'Proposal' : doc.kind === 'agreement' ? 'Agreement' : 'Other'}
                      </Pill>
                      <Pill tone={doc.status === 'signed' ? 'ok' : doc.status === 'sent' ? 'info' : 'neutral'}>
                        {doc.status === 'signed' ? 'Signed' : doc.status === 'sent' ? 'Sent' : 'Draft'}
                      </Pill>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
                      {doc.signed_at && <span>Signed {formatDate(doc.signed_at)}</span>}
                      {doc.sent_at && !doc.signed_at && <span>Sent {formatDate(doc.sent_at)}</span>}
                      {!doc.sent_at && !doc.signed_at && <span>Created {formatDate(doc.created_at)}</span>}

                      {isSafeLink(doc.external_url) && (
                        <a
                          href={doc.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-2"
                        >
                          {doc.file_id || !doc.external_url.includes('drive.google.com') ? 'Open file' : 'Google Drive link'}
                          <Icon icon={ExternalLink} size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && doc.status === 'draft' && (
                    <Button variant="secondary" onClick={() => void handleMarkSent(doc)}>
                      Mark sent
                    </Button>
                  )}
                  {canEdit && doc.status === 'sent' && (
                    <Button variant="success" onClick={() => void handleMarkSigned(doc)}>
                      Mark signed
                    </Button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      aria-label={`Delete ${doc.title}`}
                      onClick={() => void handleDelete(doc)}
                      className="inline-flex size-[36px] items-center justify-center rounded-card text-ink-muted transition-colors hover:bg-ink/5 hover:text-bad"
                    >
                      <Icon icon={Trash2} size={16} />
                    </button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Add Document Drawer */}
      <FormDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add document"
        description="Add a proposal, agreement or other file"
        dirty={Boolean(title || externalUrl || file)}
        onSubmit={handleAdd}
        submitLabel="Add document"
        pending={create.isPending}
      >
        <div className="flex flex-col gap-4">
          <Field label="Document title" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Services Agreement"
              autoFocus
            />
          </Field>

          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
              <option value="proposal">Proposal</option>
              <option value="agreement">Agreement</option>
              <option value="other">Other</option>
            </Select>
          </Field>

          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as DocumentStatus)}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
            </Select>
          </Field>

          <Field label="Attachment source">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="source_type"
                  value="drive"
                  checked={sourceType === 'drive'}
                  onChange={() => setSourceType('drive')}
                  className="size-4"
                />
                <span>Google Drive link</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="source_type"
                  value="upload"
                  checked={sourceType === 'upload'}
                  onChange={() => setSourceType('upload')}
                  className="size-4"
                />
                <span>File upload</span>
              </label>
            </div>
          </Field>

          {sourceType === 'drive' ? (
            <Field label="Google Drive URL" hint="Shareable link to view the file">
              <Input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
              />
            </Field>
          ) : (
            <Field label="Choose file" hint="PDF, Word or an image">
              <Input
                type="file"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null
                  setFile(picked)
                  if (picked && !title) setTitle(picked.name.replace(/\.[^/.]+$/, ''))
                }}
              />
              {file && <p className="text-sm text-ink-muted">Selected: {file.name}</p>}
            </Field>
          )}
        </div>
      </FormDrawer>
    </div>
  )
}

