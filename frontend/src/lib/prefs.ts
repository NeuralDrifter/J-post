// Per-machine UI preferences (view mode, collapsed column). Storage may be
// unavailable, in which case preferences simply don't persist.

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
