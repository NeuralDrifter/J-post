// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from 'react'

export type ToastKind = 'error' | 'success' | 'info'
/** A button on a toast, such as Undo. */
export type ToastAction = { label: string; onClick: () => void }
export type Toast = { id: number; kind: ToastKind; message: string; action?: ToastAction }

/** Toasts with an action stay longer, so there's time to use it. */
const ACTION_TOAST_MS = 6000

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Runs a toast's action, once, and dismisses it. */
export function runToastAction(shown: Toast) {
  if (!toasts.some((t) => t.id === shown.id)) return
  dismissToast(shown.id)
  shown.action?.onClick()
}

function push(kind: ToastKind, message: string, action?: ToastAction) {
  const id = nextId++
  toasts = [...toasts.slice(-4), { id, kind, message, action }]
  emit()
  setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : action ? ACTION_TOAST_MS : 3500)
}

export const toast = {
  error: (message: string, action?: ToastAction) => push('error', message, action),
  success: (message: string, action?: ToastAction) => push('success', message, action),
  info: (message: string, action?: ToastAction) => push('info', message, action),
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The toasts on screen, oldest first. */
export const currentToasts = (): Toast[] => toasts

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, currentToasts)
}
