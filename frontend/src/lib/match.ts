// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { app, settings } from './backend'

// Job match scores on Discover. The backend computes the overall %; these
// helpers only present it.

export type MatchBand = 'good' | 'fair' | 'low'

export function matchBand(overall: number): MatchBand {
  if (overall >= 80) return 'good'
  if (overall >= 60) return 'fair'
  return 'low'
}

/** The factors in display order, with the weights the backend uses (internal/app/match.go). */
export const MATCH_FACTORS = [
  { key: 'resumeFit', label: 'Resume fit', weight: 50 },
  { key: 'seniority', label: 'Seniority', weight: 20 },
  { key: 'location', label: 'Work mode & location', weight: 15 },
  { key: 'salary', label: 'Salary', weight: 15 },
] as const

export type FactorRow = { label: string; weight: number; applicable: boolean; score: number; note: string }

export function factorRows(m: app.MatchScore): FactorRow[] {
  return MATCH_FACTORS.map((f) => {
    const x = m.factors[f.key]
    return { label: f.label, weight: f.weight, applicable: x.applicable, score: x.score, note: x.note }
  })
}

/** Scored postings by overall (highest first), then unscored ones in their original order. */
export function sortByMatch(postings: app.Posting[]): app.Posting[] {
  return postings
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.match?.overall ?? -1) - (a.p.match?.overall ?? -1) || a.i - b.i)
    .map((x) => x.p)
}

/** A search starts scoring only when scoring is on and it actually brought in new postings. */
export function shouldAutoScore(s: settings.Settings | undefined, run: app.SearchRun): boolean {
  return !!s?.matchEnabled && !run.cached && run.newCount > 0
}

export function searchStatus(boards: string[], done: number, total: number): string {
  return `Searching ${boards.join(', ')} — ${done} of ${total} boards done`
}

export function scoringStatus(done: number, total: number): string {
  return total > 0 ? `Scoring matches… ${done} of ${total}` : 'Scoring matches…'
}

/** Outdated scores that "Re-score outdated" would redo (it skips Not interested postings). */
export function outdatedCount(postings: app.Posting[] | undefined): number {
  return postings?.filter((p) => p.match?.outdated && p.state !== 'dismissed').length ?? 0
}
