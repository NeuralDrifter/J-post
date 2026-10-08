// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { main } from './backend'

export const SCORE_DIMENSIONS: [keyof main.ScoreSet, string][] = [
  ['communication', 'Communication'],
  ['structure', 'Structure'],
  ['relevance', 'Relevance'],
  ['depth', 'Depth'],
  ['confidence', 'Confidence'],
]

export function averageScore(s?: main.ScoreSet): number | undefined {
  if (!s) return undefined
  const values = SCORE_DIMENSIONS.map(([k]) => s[k])
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

/** "4:05" */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// A prepared session is handed from the setup dialog to the live page in memory;
// the token never goes into the URL or storage. Reading doesn't consume it (React
// may run state setup twice in development); the page releases it when done.
const pending = new Map<string, main.LiveSession>()
export const holdSession = (s: main.LiveSession) => pending.set(s.sessionId, s)
export const peekSession = (id: string) => pending.get(id)
export const releaseSession = (id: string) => pending.delete(id)

const TIP_MATCH_MS = 1500 // a tip's answer start and its transcript line's time may differ by message timing

/**
 * Places saved coaching tips under the answers they were about. A tip belongs to
 * the candidate line starting closest to its answerAtMs (within TIP_MATCH_MS);
 * tips with no such line are returned as unmatched so they're never dropped.
 */
export function attachTips(lines: main.TranscriptLine[], tips: main.InterviewTip[]) {
  const byLine = new Map<number, main.InterviewTip[]>()
  const unmatched: main.InterviewTip[] = []
  for (const tip of tips) {
    let best = -1
    lines.forEach((l, i) => {
      if (l.speaker !== 'you' || Math.abs(l.atMs - tip.answerAtMs) > TIP_MATCH_MS) return
      if (best < 0 || Math.abs(l.atMs - tip.answerAtMs) < Math.abs(lines[best].atMs - tip.answerAtMs)) best = i
    })
    if (best < 0) unmatched.push(tip)
    else byLine.set(best, [...(byLine.get(best) ?? []), tip])
  }
  return { byLine, unmatched }
}

/**
 * Which grade buttons an interview offers. "Grade now" uses the default grader
 * from Settings; "Grade with…" picks any provider, including when grading
 * failed or never happened.
 */
export function gradeActions(status: string): { gradeNow: boolean; gradeWith: boolean } {
  if (status === 'scoring') return { gradeNow: false, gradeWith: false }
  if (status === 'done') return { gradeNow: false, gradeWith: true }
  return { gradeNow: true, gradeWith: true }
}

/**
 * Interviews for one job. A filter whose job has no interviews left (its last
 * one was just deleted) shows everything instead of an empty list.
 */
export function filterByJob<T extends { jobId: string }>(list: T[], jobId: string): T[] {
  if (!jobId || !list.some((m) => m.jobId === jobId)) return list
  return list.filter((m) => m.jobId === jobId)
}
