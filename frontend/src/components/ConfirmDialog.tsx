// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { apiOk } from '../lib/api'
import { Modal } from './Modal'

type ConfirmOptions = { title: string; message: string; confirmLabel?: string; danger?: boolean }
type PromptOptions = { title: string; label: string; initial?: string; confirmLabel?: string }

type Pending =
  | ({ kind: 'confirm'; resolve: (ok: boolean) => void } & ConfirmOptions)
  | ({ kind: 'prompt'; resolve: (value: string | null) => void } & PromptOptions)

let pending: Pending | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function cancelPending() {
  if (pending?.kind === 'confirm') pending.resolve(false)
  if (pending?.kind === 'prompt') pending.resolve(null)
}

/** In-app replacement for window.confirm(); resolves true when confirmed. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  cancelPending()
  return new Promise((resolve) => {
    pending = { kind: 'confirm', ...options, resolve }
    emit()
  })
}

/**
 * Asks before something that can't be undone, then runs action. True only when
 * the user confirmed and the action succeeded; a failure shows a toast.
 */
export async function confirmThen(options: Omit<ConfirmOptions, 'danger'>, action: () => Promise<unknown>): Promise<boolean> {
  return (await confirmDialog({ ...options, danger: true })) && (await apiOk(action()))
}

/** In-app replacement for window.prompt(); resolves the trimmed text, or null if cancelled. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  cancelPending()
  return new Promise((resolve) => {
    pending = { kind: 'prompt', ...options, resolve }
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
  const done = () => {
    pending = null
    emit()
  }
  if (p.kind === 'prompt') {
    return (
      <PromptModal
        key={p.title}
        options={p}
        onDone={(value) => {
          p.resolve(value)
          done()
        }}
      />
    )
  }
  const finish = (ok: boolean) => {
    p.resolve(ok)
    done()
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

function PromptModal({ options, onDone }: { options: PromptOptions; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(options.initial ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onDone(value.trim())
  }
  return (
    <Modal title={options.title} onClose={() => onDone(null)} width="max-w-md">
      <form onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className="label-mono">{options.label}</span>
          <input className="field" autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!value.trim()}>
            {options.confirmLabel ?? 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
