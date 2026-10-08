// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from 'react'

export type ToastKind = 'error' | 'success' | 'info'
export type Toast = { id: number; kind: ToastKind; message: string }

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

function push(kind: ToastKind, message: string) {
  const id = nextId++
  toasts = [...toasts.slice(-4), { id, kind, message }]
  emit()
  setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 3500)
}

export const toast = {
  error: (message: string) => push('error', message),
  success: (message: string) => push('success', message),
  info: (message: string) => push('info', message),
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts)
}
