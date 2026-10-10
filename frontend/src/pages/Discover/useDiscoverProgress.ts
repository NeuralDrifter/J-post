// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react'
import { EventsOn } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'

/** What Discover is busy with: searching some boards, or scoring postings. */
export type DiscoverProgress = { phase: 'searching'; boards: string[]; done: number; total: number } | { phase: 'scoring'; done: number; total: number }

type ProgressEvent = { done: number; total: number }

/** The current search or scoring progress, kept up to date from the backend's progress events. */
export function useDiscoverProgress() {
  const [progress, setProgress] = useState<DiscoverProgress | null>(null)
  useEffect(() => {
    const offSearch = EventsOn('search:progress', (p: ProgressEvent) =>
      setProgress((cur) => (cur?.phase === 'searching' ? { ...cur, done: p.done, total: p.total } : cur)),
    )
    const offMatch = EventsOn('match:progress', (p: ProgressEvent) => {
      setProgress({ phase: 'scoring', done: p.done, total: p.total })
      notifyDataChanged() // badges fill in request by request
    })
    return () => {
      offSearch()
      offMatch()
    }
  }, [])
  return [progress, setProgress] as const
}
