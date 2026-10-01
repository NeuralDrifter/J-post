import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { dismissToast, useToasts, type ToastKind } from '../lib/toast'

const STYLE: Record<ToastKind, string> = {
  error: 'border-danger/40 bg-rose-950/80 text-rose-100',
  success: 'border-success/40 bg-emerald-950/80 text-emerald-100',
  info: 'border-line-strong bg-raised/90 text-ink',
}

const ICON = { error: CircleAlert, success: CircleCheck, info: Info }

export function Toaster() {
  const toasts = useToasts()
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-2xl backdrop-blur-xl ${STYLE[t.kind]}`}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <p className="flex-1 break-words">{t.message}</p>
            <button className="opacity-60 hover:opacity-100" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
