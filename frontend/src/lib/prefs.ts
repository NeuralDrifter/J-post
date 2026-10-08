// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Per-machine UI preferences (view mode, collapsed column), plus values that
// should outlive navigating between pages but not a restart. Storage may be
// unavailable, in which case values simply don't persist.

export function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`jobtrack.${key}`) ?? fallback
  } catch {
    return fallback
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`jobtrack.${key}`, value)
  } catch {
    // ignore: preference just won't persist
  }
}

/** Kept until the app closes: survives leaving and returning to a page. */
export function readSessionValue<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(`jobtrack.${key}`)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

export function writeSessionValue(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(`jobtrack.${key}`, JSON.stringify(value))
  } catch {
    // ignore: the value just won't survive navigation
  }
}
