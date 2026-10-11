// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { computeOutcomes, median, sourceCounts, weeklyApplications, type InsightEvent, type InsightJob } from './insights'

const job = (id: string, status: string, extra: Partial<InsightJob> = {}): InsightJob => ({
  id, status, closeReason: '', source: 'manual', resumeId: '', dateApplied: '', createdAt: '2026-09-01T09:00:00.000Z', ...extra,
})
const event = (jobId: string, toStatus: string, at: string, closeReason = ''): InsightEvent => ({ jobId, toStatus, closeReason, at })

const jobs = [
  job('a', 'interviewing', { resumeId: 'tailored-a' }),
  job('b', 'closed', { closeReason: 'rejected', resumeId: 'base' }),
  job('c', 'applied', { resumeId: 'base', source: 'linkedin' }),
  job('d', 'interested'),
  job('e', 'closed', { closeReason: 'ghosted' }),
]
const events = [
  event('a', 'applied', '2026-09-01T09:00:00.000Z'),
  event('a', 'interviewing', '2026-09-05T09:00:00.000Z'),
  event('b', 'applied', '2026-09-02T09:00:00.000Z'),
  event('b', 'closed', '2026-09-12T09:00:00.000Z', 'rejected'),
  event('c', 'applied', '2026-09-03T09:00:00.000Z'),
  event('d', 'interested', '2026-09-03T09:00:00.000Z'),
  event('e', 'applied', '2026-09-04T09:00:00.000Z'),
  event('e', 'closed', '2026-09-30T09:00:00.000Z', 'ghosted'),
]

describe('outcomes', () => {
  const outcomes = computeOutcomes(jobs, events, (j) => j.resumeId.startsWith('tailored'))

  it('counts every application that reached each stage, closed ones included', () => {
    expect(outcomes.funnel).toEqual([
      { status: 'applied', reached: 4 },
      { status: 'interviewing', reached: 1 },
      { status: 'offer', reached: 0 },
    ])
  })

  it('counts an interview or a rejection as hearing back, not ghosting', () => {
    expect(outcomes.sent).toBe(4)
    expect(outcomes.heardBack).toBe(2)
    expect(outcomes.medianDaysToReply).toBe(7) // 4 days and 10 days
  })

  it('compares tailored resumes with base ones', () => {
    expect(outcomes.tailored).toEqual({ sent: 1, replied: 1 })
    expect(outcomes.base).toEqual({ sent: 2, replied: 1 })
  })

  it('counts active and closed jobs', () => {
    expect(outcomes.active).toBe(2)
    expect(outcomes.closed).toBe(2)
  })
})

describe('pace and sources', () => {
  it('buckets applications by the week they were sent', () => {
    // Wednesday 9 September: the weeks of Monday 31 August (all four sent 1 to 4 September) and Monday 7 September.
    const weeks = weeklyApplications(jobs, events, new Date(2026, 8, 9), 2)
    expect(weeks.map((w) => w.count)).toEqual([4, 0])
    expect(weeks[1]!.start.getDay()).toBe(1)
  })

  it('counts jobs by source, most first', () => {
    expect(sourceCounts(jobs)).toEqual([
      { source: 'manual', count: 4 },
      { source: 'linkedin', count: 1 },
    ])
  })

  it('takes the median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})
