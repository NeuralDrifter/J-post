// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app, settings } from './backend'
import { factorRows, matchBand, outdatedCount, scoringStatus, searchStatus, shouldAutoScore, sortByMatch } from './match'

const f = (applicable: boolean, score: number, note = '') => ({ applicable, score, note })
const score = (overall: number, outdated = false) =>
  ({
    overall,
    outdated,
    factors: { resumeFit: f(true, overall, 'Go'), seniority: f(true, 60, 'senior'), location: f(false, 0, 'no preference'), salary: f(false, 0, 'no salary listed') },
    strengths: [],
    gaps: [],
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    scoredAt: '2026-10-08T15:42:00.000Z',
  }) as unknown as app.MatchScore
const posting = (id: string, overall?: number, outdated = false) => ({ id, match: overall === undefined ? undefined : score(overall, outdated) }) as app.Posting

describe('matchBand', () => {
  it('splits at 80 and 60', () => {
    expect(matchBand(100)).toBe('good')
    expect(matchBand(80)).toBe('good')
    expect(matchBand(79)).toBe('fair')
    expect(matchBand(60)).toBe('fair')
    expect(matchBand(59)).toBe('low')
    expect(matchBand(0)).toBe('low')
  })
})

describe('factorRows', () => {
  it('lists the four factors with weights, keeping not-applicable ones', () => {
    const rows = factorRows(score(84))
    expect(rows.map((r) => `${r.label}:${r.weight}:${r.applicable}`)).toEqual([
      'Resume fit:50:true',
      'Seniority:20:true',
      'Work mode & location:15:false',
      'Salary:15:false',
    ])
    expect(rows[3].note).toBe('no salary listed')
  })
})

describe('sortByMatch', () => {
  it('puts scored postings first, highest first, then unscored in their order', () => {
    const sorted = sortByMatch([posting('u1'), posting('a', 62), posting('u2'), posting('b', 91), posting('c', 62)])
    expect(sorted.map((p) => p.id)).toEqual(['b', 'a', 'c', 'u1', 'u2'])
  })
})

describe('shouldAutoScore', () => {
  const on = { matchEnabled: true } as settings.Settings
  const run = (cached: boolean, newCount: number) => ({ cached, newCount }) as app.SearchRun
  it('scores only after a real search that found new postings, with scoring on', () => {
    expect(shouldAutoScore(on, run(false, 3))).toBe(true)
    expect(shouldAutoScore(on, run(true, 3))).toBe(false)
    expect(shouldAutoScore(on, run(false, 0))).toBe(false)
    expect(shouldAutoScore({ matchEnabled: false } as settings.Settings, run(false, 3))).toBe(false)
    expect(shouldAutoScore(undefined, run(false, 3))).toBe(false)
  })
})

describe('status text', () => {
  it('describes each phase', () => {
    expect(searchStatus(['Indeed', 'LinkedIn'], 1, 2)).toBe('Searching Indeed, LinkedIn — 1 of 2 boards done')
    expect(scoringStatus(0, 0)).toBe('Scoring matches…')
    expect(scoringStatus(25, 60)).toBe('Scoring matches… 25 of 60')
  })
})

describe('outdatedCount', () => {
  it('counts outdated scores only', () => {
    expect(outdatedCount([posting('a', 70, true), posting('b', 70), posting('c')])).toBe(1)
    expect(outdatedCount(undefined)).toBe(0)
  })
  it('ignores Not interested postings, which re-scoring skips', () => {
    const dismissed = { ...posting('d', 70, true), state: 'dismissed' } as app.Posting
    expect(outdatedCount([dismissed, posting('a', 70, true)])).toBe(1)
  })
})
