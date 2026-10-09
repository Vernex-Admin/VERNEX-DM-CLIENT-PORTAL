import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'

export type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  // Usually the confirm and cancel buttons.
  footer?: ReactNode
}

type Placement = 'center' | 'right'

const placements: Record<Placement, { dialog: string; frame: string }> = {
  // Centred from 640px up, bottom sheet below.
  center: {
    dialog:
      'm-auto w-[calc(100%-2rem)] max-w-md rounded-card border ' +
      'max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 ' +
      'max-sm:starting:open:translate-y-3',
    frame: 'max-h-[85dvh]',
  },
  right: {
    dialog: 'my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-md border-l starting:open:translate-x-3',
    frame: 'h-dvh',
  },
}

// Native <dialog>: the browser handles the focus trap, Esc, and returning focus to the opener.
export function ModalSurface({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  placement,
}: ModalProps & { placement: Placement }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      // The dialog element has no padding, so a click that lands on it is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cn(
        'border-rule bg-surface text-ink backdrop:bg-ink/40',
        'transition-[opacity,translate] duration-150 starting:open:opacity-0',
        placements[placement].dialog,
      )}
    >
      <div className={cn('flex flex-col', placements[placement].frame)}>
        <header className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[1.2rem] leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 inline-flex size-[44px] shrink-0 items-center justify-center rounded-card text-ink-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink sm:size-[32px]"
          >
            <Icon icon={X} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-rule px-4 py-3 sm:flex-row sm:justify-end">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
