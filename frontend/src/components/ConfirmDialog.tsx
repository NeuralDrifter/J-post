import { useSyncExternalStore } from 'react'
import { Modal } from './Modal'

type ConfirmOptions = { title: string; message: string; confirmLabel?: string; danger?: boolean }
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let pending: Pending | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** In-app replacement for window.confirm(); resolves true when confirmed. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false)
  return new Promise((resolve) => {
    pending = { ...options, resolve }
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function ConfirmHost() {
  const p = useSyncExternalStore(subscribe, () => pending)
  if (!p) return null
  const finish = (ok: boolean) => {
    p.resolve(ok)
    pending = null
    emit()
  }
  return (
    <Modal title={p.title} onClose={() => finish(false)} width="max-w-md">
      <p className="text-sm leading-relaxed text-ink-2">{p.message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={() => finish(false)}>
          Cancel
        </button>
        <button className={`btn ${p.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => finish(true)} autoFocus>
          {p.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </Modal>
  )
}
