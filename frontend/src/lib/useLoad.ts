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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  return { data, loading, setData }
}
