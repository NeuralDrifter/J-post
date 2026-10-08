// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { toast } from './toast'

export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return String(err)
}

/** Awaits a backend call; on failure shows a toast and resolves to undefined. */
export async function api<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise
  } catch (err) {
    toast.error(errorMessage(err))
    return undefined
  }
}

/** For calls with no result: true on success, false (plus a toast) on failure. */
export async function apiOk(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise
    return true
  } catch (err) {
    toast.error(errorMessage(err))
    return false
  }
}
