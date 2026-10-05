import { useEffect, useState } from 'react'
import { api } from './api'
import { ListJobSources, type main } from './backend'

// Job boards come from the backend registry (sources.go). Labels never change
// while the app runs, so this copy is cached; readiness can change in Settings,
// so the Discover page loads its own fresh list.

const MANUAL_SOURCE = { id: 'manual', label: 'Manual' }

let cache: main.JobSource[] | undefined

export function useJobSources(): main.JobSource[] {
  const [sources, setSources] = useState(cache ?? [])
  useEffect(() => {
    if (cache) return
    void api(ListJobSources()).then((list) => {
      if (!list) return
      cache = list
      setSources(list)
    })
  }, [])
  return sources
}

export function sourceLabel(sources: main.JobSource[], id: string): string {
  if (id === MANUAL_SOURCE.id) return MANUAL_SOURCE.label
  return sources.find((s) => s.id === id)?.label ?? id
}

/** Every source a job can come from, for filters: the boards plus "Manual". */
export function sourceOptions(sources: main.JobSource[]): { id: string; label: string }[] {
  return [...sources.map(({ id, label }) => ({ id, label })), MANUAL_SOURCE]
}

export function defaultSourceIds(sources: main.JobSource[]): string[] {
  return sources.filter((s) => s.defaultOn).map((s) => s.id)
}
