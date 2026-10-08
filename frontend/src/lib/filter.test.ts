// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app } from './backend'
import { filterSummaries, sortSummaries } from './filter'

function summary(job: Partial<app.Job>, daysInStage = 0): app.JobSummary {
  return {
    job: { company: '', position: '', location: '', workMode: '', source: 'manual', status: 'interested', dateApplied: '', ...job },
    daysInStage,
  } as unknown as app.JobSummary
}

const list = [
  summary({ id: 'a', company: 'Acme', position: 'Backend Dev', location: 'Denver', workMode: 'remote', source: 'linkedin', status: 'applied', salaryMax: 150000, dateApplied: '2026-09-01' }, 5),
  summary({ id: 'b', company: 'Brex', position: 'Product Manager', workMode: 'hybrid', status: 'offer', salaryMin: 200000, dateApplied: '2026-09-10' }, 1),
  summary({ id: 'c', company: 'Cora', position: 'Designer', status: 'interested' }, 9),
]
const ids = (l: app.JobSummary[]) => l.map((s) => s.job.id).join(',')

describe('filterSummaries', () => {
  it('matches the query against company, position and location, case-insensitively', () => {
    expect(ids(filterSummaries(list, { query: 'acme', workMode: '', source: '' }))).toBe('a')
    expect(ids(filterSummaries(list, { query: 'MANAGER', workMode: '', source: '' }))).toBe('b')
    expect(ids(filterSummaries(list, { query: 'denver', workMode: '', source: '' }))).toBe('a')
    expect(ids(filterSummaries(list, { query: '  ', workMode: '', source: '' }))).toBe('a,b,c')
  })
  it('filters by work mode and source', () => {
    expect(ids(filterSummaries(list, { query: '', workMode: 'hybrid', source: '' }))).toBe('b')
    expect(ids(filterSummaries(list, { query: '', workMode: '', source: 'linkedin' }))).toBe('a')
  })
})

describe('sortSummaries', () => {
  it('sorts by several keys in both directions without mutating input', () => {
    expect(ids(sortSummaries(list, 'daysInStage', 'desc'))).toBe('c,a,b')
    expect(ids(sortSummaries(list, 'company', 'asc'))).toBe('a,b,c')
    expect(ids(sortSummaries(list, 'status', 'asc'))).toBe('c,a,b')
    expect(ids(sortSummaries(list, 'salary', 'desc'))).toBe('b,a,c')
    expect(ids(sortSummaries(list, 'dateApplied', 'desc'))).toBe('b,a,c')
    expect(ids(list)).toBe('a,b,c')
  })
})
