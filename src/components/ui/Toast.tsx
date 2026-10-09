import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../Icon'

const TOAST_MS = 4000

export type ToastTone = 'info' | 'ok' | 'bad'

export type ToastInput = {
  title: string
  description?: string
  tone?: ToastTone
}

type ToastRecord = ToastInput & { id: number }

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

export function useToast(): (toast: ToastInput) => void {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>')
  return toast
}

const icons: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-info' },
  ok: { icon: CircleCheck, className: 'text-ok' },
  bad: { icon: CircleAlert, className: 'text-bad' },
}

function ToastItem({ toast, dismiss }: { toast: ToastRecord; dismiss: (id: number) => void }) {
  const tone = toast.tone ?? 'info'

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast.id, dismiss])

  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 rounded-card border border-rule bg-surface py-2.5 pr-1 pl-3 text-ink"
    >
      <Icon icon={icons[tone].icon} className={cn('mt-0.5 shrink-0', icons[tone].className)} />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-medium">{toast.title}</p>
        {toast.description && <p className="text-sm text-ink-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(toast.id)}
        className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-card text-ink-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink sm:size-[28px]"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const nextId = useRef(0)

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++
    setToasts((current) => [...current, { ...toast, id }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 *:pointer-events-auto"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  )
}
