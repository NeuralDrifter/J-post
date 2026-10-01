import { useSyncExternalStore } from 'react'

// A global "data changed" counter. Any mutation calls notifyDataChanged(); every
// useLoad() re-fetches, so the board, metrics and top bar never go stale.
let version = 0
const listeners = new Set<() => void>()

export function notifyDataChanged(): void {
  version++
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
