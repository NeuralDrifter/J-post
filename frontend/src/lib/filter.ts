// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { main } from './backend'
import { STATUSES } from './format'

export type Filters = { query: string; workMode: string; source: string }

export function filterSummaries(list: main.JobSummary[], f: Filters): main.JobSummary[] {
  const q = f.query.trim().toLowerCase()
  return list.filter(({ job }) => {
    if (q && ![job.company, job.position, job.location].some((v) => v.toLowerCase().includes(q))) return false
    if (f.workMode && job.workMode !== f.workMode) return false
    if (f.source && job.source !== f.source) return false
    return true
  })
}

export type SortKey = 'company' | 'position' | 'status' | 'salary' | 'dateApplied' | 'daysInStage'
export type SortDir = 'asc' | 'desc'

function sortValue(s: main.JobSummary, key: SortKey): string | number {
  switch (key) {
    case 'company':
      return s.job.company.toLowerCase()
    case 'position':
      return s.job.position.toLowerCase()
    case 'status':
      return STATUSES.indexOf(s.job.status as (typeof STATUSES)[number])
    case 'salary':
      return s.job.salaryMax ?? s.job.salaryMin ?? -1
    case 'dateApplied':
      return s.job.dateApplied
    case 'daysInStage':
      return s.daysInStage
  }
}

export function sortSummaries(list: main.JobSummary[], key: SortKey, dir: SortDir): main.JobSummary[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    return va < vb ? -sign : va > vb ? sign : 0
  })
}
