import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Circle, CircleCheck, Download, ExternalLink, File as FileIcon, FileText, FolderOpen, Image as ImageIcon, Upload } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, Card, CardBody, CardHeader, EmptyState, Skeleton, Tabs, useToast } from '../../components/ui'
import { cn } from '../../lib/cn'
import { brandChecklist, checklistPercent } from '../../lib/brandChecklist'
import { formatDate } from '../../lib/dates'
import { useCan } from '../../lib/permissions'
import { useCurrentProfile, useFiles, useUploadBrandAsset } from '../../lib/queries'
import type { FileFolder, FileRecord } from '../../types/db'

type TabFolder = Extract<FileFolder, 'brand_assets' | 'rendered_ads' | 'documents' | 'invoices'>

const TABS: { id: TabFolder; label: string; empty: { title: string; description: string } }[] = [
  { id: 'brand_assets', label: 'Brand Assets', empty: { title: 'No brand assets yet', description: 'Drop your logo, colours, fonts and product photos here.' } },
  { id: 'rendered_ads', label: 'Rendered Ads', empty: { title: 'No finished ads yet', description: 'Approved ad creatives will appear here once Vernex delivers them.' } },
  { id: 'documents', label: 'Documents', empty: { title: 'No documents yet', description: 'Contracts, scopes of work and reports will appear here.' } },
  { id: 'invoices', label: 'Invoices', empty: { title: 'No invoice files yet', description: 'A PDF of each invoice will appear here when it is issued.' } },
]

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function VaultPage() {
  const { data: profile } = useCurrentProfile()
  const clientId = profile?.client_id ?? undefined

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-[1.6rem] leading-tight">Vault</h1>
      <Tabs
        label="Vault folders"
        items={TABS.map((tab) => ({
          id: tab.id,
          label: tab.label,
          content: <Folder clientId={clientId} folder={tab.id} empty={tab.empty} />,
        }))}
      />
    </div>
  )
}

function Folder({ clientId, folder, empty }: { clientId: string | undefined; folder: TabFolder; empty: { title: string; description: string } }) {
  const files = useFiles(clientId ? { client_id: clientId, folder } : undefined)
  const isBrand = folder === 'brand_assets'

  return (
    <div className="flex flex-col gap-4">
      {isBrand && clientId && <Uploader clientId={clientId} />}
      {isBrand && <Checklist files={files.data} />}

      {files.isPending ? (
        <FilesSkeleton />
      ) : files.isError ? (
        <QueryError what="your files" onRetry={() => files.refetch()} />
      ) : files.data.length === 0 ? (
        <EmptyState icon={FolderOpen} title={empty.title} description={empty.description} />
      ) : (
        <ul aria-label="Files" className="flex flex-col gap-2 md:grid md:grid-cols-3 md:gap-4">
          {[...files.data]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((file) => (
              <FileItem key={file.id} file={file} />
            ))}
        </ul>
      )}
    </div>
  )
}

function glyphFor(file: FileRecord) {
  if (file.mime_type?.startsWith('image/')) return ImageIcon
  if (file.mime_type === 'application/pdf') return FileText
  return FileIcon
}

// A row on mobile, a card on desktop. Files can only be downloaded: no rename, move or delete.
function FileItem({ file }: { file: FileRecord }) {
  const isImage = file.mime_type?.startsWith('image/') && file.url
  const meta = [file.size_bytes !== null ? formatSize(file.size_bytes) : null, formatDate(file.created_at)].filter(Boolean).join(' · ')

  return (
    <li className="flex items-center gap-3 rounded-card border border-rule bg-surface p-3 md:flex-col md:items-stretch">
      <div className="flex size-[56px] shrink-0 items-center justify-center overflow-hidden rounded-field border border-rule bg-paper md:h-32 md:w-full">
        {isImage ? (
          <img src={file.url as string} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <Icon icon={glyphFor(file)} size={24} className="text-ink-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate leading-snug font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-sm text-ink-muted">{meta}</p>
        {file.external_url && <p className="text-sm text-ink-muted">Opens in Google Drive</p>}
      </div>
      {file.external_url ? (
        <a
          href={file.external_url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${file.name} in Google Drive`}
          className={actionLink}
        >
          <Icon icon={ExternalLink} size={16} />
          <span className="max-sm:sr-only">Open</span>
        </a>
      ) : file.url ? (
        <a href={file.url} download={file.name} aria-label={`Download ${file.name}`} className={actionLink}>
          <Icon icon={Download} size={16} />
          <span className="max-sm:sr-only">Download</span>
        </a>
      ) : (
        <span className="text-sm text-ink-muted">Not ready</span>
      )}
    </li>
  )
}

const actionLink =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-card border border-rule bg-surface px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-ink/5 lg:min-h-[30px]'

function Uploader({ clientId }: { clientId: string }) {
  const toast = useToast()
  const upload = useUploadBrandAsset()
  const canUpload = useCan('brand_asset', 'upload', { clientId })
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  if (!canUpload) return null

  async function send(list: FileList | File[]) {
    const files = Array.from(list)
    if (files.length === 0) return
    try {
      for (const file of files) {
        await upload.mutateAsync({
          client_id: clientId,
          name: file.name,
          mime_type: file.type || undefined,
          size_bytes: file.size,
          url: URL.createObjectURL(file),
        })
      }
      toast({ title: files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`, tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not upload', description: messageOf(error), tone: 'bad' })
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setOver(false)
    void send(event.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center gap-2 rounded-card border border-dashed px-4 py-6 text-center',
        over ? 'border-ink bg-ink/5' : 'border-ink-muted bg-surface',
      )}
    >
      <Icon icon={Upload} size={22} className="text-ink-muted" />
      <p>
        <span className="max-sm:hidden">Drag files here, or </span>
        <span className="sm:hidden">Add your logo, colours, fonts and photos. </span>
        choose from your device.
      </p>
      <Button size="sm" loading={upload.isPending} onClick={() => input.current?.click()}>
        Choose files
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Upload brand assets"
        onChange={(event) => {
          void send(event.target.files ?? [])
          event.target.value = ''
        }}
      />
    </div>
  )
}

function Checklist({ files }: { files: FileRecord[] | undefined }) {
  if (!files) return null
  const items = brandChecklist(files)
  const percent = checklistPercent(items)
  return (
    <Card>
      <CardHeader
        title="Brand Assets checklist"
        description="What we need from you to keep your work moving."
        action={<p className="font-display text-[1.4rem] leading-none font-semibold">{percent}% complete</p>}
      />
      <CardBody className="flex flex-col gap-3">
        <div
          role="progressbar"
          aria-label="Brand Assets complete"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full rounded-field bg-rule"
        >
          <div className="h-full rounded-field bg-ok" style={{ width: `${percent}%` }} />
        </div>
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <Icon icon={item.done ? CircleCheck : Circle} className={item.done ? 'text-ok' : 'text-ink-muted'} />
              <span className={item.done ? '' : 'text-ink-muted'}>{item.label}</span>
              {!item.done && item.detail && <span className="text-sm text-ink-muted">({item.detail})</span>}
              <span className="sr-only">{item.done ? 'Done' : 'Still needed'}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

function FilesSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 md:grid md:grid-cols-3 md:gap-4">
      {[0, 1, 2].map((tile) => (
        <div key={tile} className="flex items-center gap-3 rounded-card border border-rule bg-surface p-3 md:flex-col md:items-stretch">
          <Skeleton className="size-[56px] shrink-0 md:h-32 md:w-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
