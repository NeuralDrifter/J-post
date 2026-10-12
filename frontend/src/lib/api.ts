// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { isNeedsResume, requestNeedsResume } from './needsResume'
import { toast } from './toast'

export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return String(err)
}

/** Tells the user what failed: a missing resume gets its own dialog, anything else a toast. */
export function reportError(err: unknown): void {
  const message = errorMessage(err)
  if (isNeedsResume(message)) requestNeedsResume()
  else toast.error(message)
}

/** Awaits a backend call; on failure reports it and resolves to undefined. */
export async function api<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise
  } catch (err) {
    reportError(err)
    return undefined
  }
}

/** For calls with no result: true on success, false (reported) on failure. */
export async function apiOk(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise
    return true
  } catch (err) {
    reportError(err)
    return false
  }
}
