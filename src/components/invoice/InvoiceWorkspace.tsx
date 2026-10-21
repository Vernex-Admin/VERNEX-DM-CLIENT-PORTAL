import { useEffect, useImperativeHandle, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'
import { Maximize, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import { MM, PAGE_CONTENT_HEIGHT, PAGE_NUMBER_HEIGHT, planPages } from '../../lib/invoicePagination'
import type { PagePlan } from '../../lib/invoicePagination'
import { Icon } from '../Icon'
import { InvoicePages, InvoiceSheet } from './InvoiceSheet'
import type { InvoiceSheetProps } from './InvoiceSheet'

// The invoice workspace: a neutral desk with the A4 document centred on it, zoom controls, and the
// hidden copies that make printing and PDF download match the preview page for page.

export type InvoiceWorkspaceHandle = {
  /** Opens the browser's print dialog with exactly the previewed pages. */
  print: () => void
  /** Builds a vector PDF of the previewed pages and downloads it. */
  downloadPdf: () => Promise<void>
}

type ZoomMode = 'fit-page' | 'fit-width' | number

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]
const PAGE_WIDTH_PX = 210 * MM
const PAGE_HEIGHT_PX = 297 * MM
/** Editing adds the row tools to the right of the page and page-break labels to the left. */
const EDIT_GUTTER_PX = 170
const DESK_PADDING_PX = 40

const singlePage = (rows: number): PagePlan[] => [{ first: true, rows: [0, rows], table: true, closing: true }]
const sameplan = (a: PagePlan[], b: PagePlan[]) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Measures a hidden read-only copy of the invoice and plans its A4 pages. Re-plans whenever any
 * measured part changes size, including when the fonts finish loading.
 */
function usePagePlan(props: Omit<InvoiceSheetProps, 'edit'>) {
  const [measure, setMeasure] = useState<HTMLDivElement | null>(null)
  const rowCount = props.document.lines.length
  const [plan, setPlan] = useState<PagePlan[]>(() => singlePage(rowCount))
  const numbered = props.document.show_page_numbers
  const rowKey = props.document.lines.map((line) => line.id).join()

  useEffect(() => {
    if (!measure) return
    // While printing, the plan must stay exactly as previewed.
    let printing = false
    const startPrint = () => {
      printing = true
    }
    const endPrint = () => {
      printing = false
    }
    window.addEventListener('beforeprint', startPrint)
    window.addEventListener('afterprint', endPrint)
    const run = () => {
      // A hidden or not-yet-laid-out copy measures as nothing; keep the last good plan.
      if (printing || measure.getBoundingClientRect().width === 0) return
      const part = (name: string) => measure.querySelector<HTMLElement>(`[data-measure="${name}"]`)
      const height = (element: Element | null) => element?.getBoundingClientRect().height ?? 0
      const table = part('table')
      const head = part('thead')
      const next = planPages(
        {
          top: height(part('top')),
          continued: height(part('continued')),
          tableHead: table && head ? head.getBoundingClientRect().bottom - table.getBoundingClientRect().top : 0,
          rows: [...measure.querySelectorAll('[data-measure="row"]')].map(height),
          closing: height(part('closing')),
        },
        PAGE_CONTENT_HEIGHT - (numbered ? PAGE_NUMBER_HEIGHT : 0),
      )
      setPlan((current) => (sameplan(current, next) ? current : next))
    }
    void document.fonts?.ready.then(run)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run)
    observer?.observe(measure)
    measure.querySelectorAll('[data-measure]').forEach((element) => observer?.observe(element))
    return () => {
      observer?.disconnect()
      window.removeEventListener('beforeprint', startPrint)
      window.removeEventListener('afterprint', endPrint)
    }
  }, [measure, numbered, rowKey])

  // Until the first measurement, and where nothing can be measured, everything is one page.
  const usable = plan.reduce((sum, page) => sum + page.rows[1] - page.rows[0], 0) === rowCount ? plan : singlePage(rowCount)
  const measuringCopy =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <div ref={setMeasure} className="ivx-measure" aria-hidden="true">
            <InvoiceSheet {...props} measuring />
          </div>,
          document.body,
        )
  return { plan: usable, measuringCopy }
}

export function InvoiceWorkspace({
  toolbarStart,
  fileName,
  ref,
  ...props
}: InvoiceSheetProps & {
  /** Controls shown at the left of the zoom toolbar, e.g. Edit / Preview. */
  toolbarStart?: ReactNode
  /** The downloaded PDF's name, without ".pdf". */
  fileName: string
  ref?: Ref<InvoiceWorkspaceHandle>
}) {
  const { edit, ...readOnly } = props
  const { plan, measuringCopy } = usePagePlan(readOnly)
  const [printRoot, setPrintRoot] = useState<HTMLDivElement | null>(null)
  const [desk, setDesk] = useState<HTMLDivElement | null>(null)
  const [deskSize, setDeskSize] = useState({ width: 0, height: 0 })
  const [mode, setMode] = useState<ZoomMode>('fit-width')

  useEffect(() => {
    if (!desk || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setDeskSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(desk)
    return () => observer.disconnect()
  }, [desk])

  const stageWidth = PAGE_WIDTH_PX + (edit ? EDIT_GUTTER_PX : 0)
  const fitWidth = deskSize.width > 0 ? (deskSize.width - DESK_PADDING_PX) / stageWidth : 1
  const fitPage = deskSize.height > 0 ? Math.min(fitWidth, (deskSize.height - DESK_PADDING_PX) / PAGE_HEIGHT_PX) : fitWidth
  const raw = mode === 'fit-width' ? fitWidth : mode === 'fit-page' ? fitPage : mode
  const zoom = Math.min(3, Math.max(0.25, raw))

  const step = (direction: 1 | -1) => {
    const next = direction > 0 ? ZOOM_STEPS.find((value) => value > zoom + 0.001) : [...ZOOM_STEPS].reverse().find((value) => value < zoom - 0.001)
    setMode(next ?? (direction > 0 ? ZOOM_STEPS[ZOOM_STEPS.length - 1]! : ZOOM_STEPS[0]!))
  }

  const pageStarts = new Map<number, number>()
  plan.forEach((page, index) => {
    if (index > 0 && page.table && page.rows[1] > page.rows[0]) pageStarts.set(page.rows[0], index + 1)
  })

  useImperativeHandle(
    ref,
    () => ({
      print: () => {
        const previous = document.title
        document.title = fileName
        const restore = () => {
          document.title = previous
          window.removeEventListener('afterprint', restore)
        }
        window.addEventListener('afterprint', restore)
        window.print()
      },
      downloadPdf: async () => {
        const pages = [...(printRoot?.querySelectorAll<HTMLElement>('.ivx-page') ?? [])]
        if (pages.length === 0) throw new Error('The invoice pages are not ready yet. Try again.')
        const { downloadFile, exportInvoicePdf } = await import('../../lib/invoicePdfExport')
        downloadFile(await exportInvoicePdf(pages, fileName), `${fileName}.pdf`)
      },
    }),
    [fileName, printRoot],
  )

  const zoomButton = 'inline-flex min-h-[32px] items-center gap-1 rounded-field px-2 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink aria-pressed:bg-ink aria-pressed:text-surface'

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">{toolbarStart}</div>
        <div role="group" aria-label="Zoom" className="inline-flex items-center gap-0.5 rounded-card border border-rule bg-surface p-0.5">
          <button type="button" className={zoomButton} aria-pressed={mode === 'fit-page'} onClick={() => setMode('fit-page')}>
            <Icon icon={Maximize} size={14} />
            Fit page
          </button>
          <button type="button" className={zoomButton} aria-pressed={mode === 'fit-width'} onClick={() => setMode('fit-width')}>
            <Icon icon={MoveHorizontal} size={14} />
            Fit width
          </button>
          <button type="button" className={zoomButton} aria-label="Zoom out" onClick={() => step(-1)}>
            <Icon icon={ZoomOut} size={14} />
          </button>
          <span className="min-w-[3.5rem] text-center font-mono text-sm" aria-live="polite" aria-label="Zoom level">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className={zoomButton} aria-label="Zoom in" onClick={() => step(1)}>
            <Icon icon={ZoomIn} size={14} />
          </button>
        </div>
      </div>
      <p className="no-print text-sm text-ink-muted" aria-live="polite">
        A4 portrait · {plan.length} {plan.length === 1 ? 'page' : 'pages'}
        {edit && plan.length > 1 ? ' · dashed lines show where each page begins' : ''}
      </p>

      <div ref={setDesk} className="ivx-desk no-print">
        <div className={edit ? 'ivx-stage editing' : 'ivx-stage'} style={{ zoom }}>
          {edit ? <InvoiceSheet {...props} pageStarts={pageStarts} /> : <InvoicePages {...readOnly} plan={plan} />}
        </div>
      </div>

      {measuringCopy}
      {typeof document !== 'undefined' &&
        createPortal(
          // The previewed pages again, unscaled, for print and PDF. Hidden from assistive technology.
          <div ref={setPrintRoot} className="ivx-print-root" aria-hidden="true">
            <InvoicePages {...readOnly} plan={plan} />
          </div>,
          document.body,
        )}
    </div>
  )
}
