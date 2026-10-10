// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState, type DependencyList } from 'react'
import { useDataVersion } from './events'

/**
 * Runs `load` on mount, whenever `deps` change, and after any notifyDataChanged().
 * A failed load (undefined) keeps the previous data; api() already showed a toast.
 */
export function useLoad<T>(load: () => Promise<T | undefined>, deps: DependencyList) {
  const version = useDataVersion()
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load().then((result) => {
      if (cancelled) return
      if (result !== undefined) setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // Not load on purpose: callers pass a new function every render; their deps say when to reload.
  }, [...deps, version])

  return { data, loading, setData }
}
