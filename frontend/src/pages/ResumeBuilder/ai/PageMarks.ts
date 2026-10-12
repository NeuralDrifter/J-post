// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo } from 'react'
import { produce, type Draft } from 'immer'
import { useReview } from './ReviewContext'

/** The document as the page shows it while changes wait: each pending text change marked in place. Never saved. */
export function useMarkedChanges<T>(data: T): T {
  const { reviews } = useReview<T>()
  return useMemo(() => {
    const marks = reviews.flatMap((r) => r.changes).filter((c) => c.status === 'pending' && c.markOnPage)
    if (marks.length === 0) return data
    return produce(data, (draft: Draft<T>) => {
      for (const change of marks) change.markOnPage?.(draft)
    })
  }, [data, reviews])
}
