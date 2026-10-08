// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { main } from './backend'

// Question plans: attempts at the same plan, retrying, and comparing attempts.

/** "Attempt 2 of 3"; empty when there's nothing to compare against. */
export function attemptLabel(attempt: number, total: number): string {
  return attempt > 0 && total > 1 ? `Attempt ${attempt} of ${total}` : ''
}

/** Only an interview whose plan actually loaded can be retried with the same questions. */
export function canRetry(mi: { plan?: unknown; planError: string }): boolean {
  return !!mi.plan && mi.planError === ''
}

export type AttemptAnswer = { attemptId: string; answerSummary: string; improve: string }

export type AttemptComparison = {
  questions: { question: string; byAttempt: AttemptAnswer[] }[]
  /** Reviews that don't match a planned question (off-plan, or no usable planIndex). */
  other: { attemptId: string; reviews: main.QuestionReview[] }[]
}

/** Lines up each attempt's answers (from its newest scorecard) under the planned questions. */
export function compareAttempts(plan: main.InterviewPlan, attempts: main.MockInterview[]): AttemptComparison {
  const questions = plan.questions.map((q) => ({ question: q.question, byAttempt: [] as AttemptAnswer[] }))
  const other: AttemptComparison['other'] = []
  for (const a of attempts) {
    const reviews = a.scorecards[0]?.scorecard.questions ?? []
    const unmatched: main.QuestionReview[] = []
    for (const r of reviews) {
      const i = r.planIndex
      if (i === undefined || i === null || i < 0 || i >= questions.length) {
        unmatched.push(r)
        continue
      }
      questions[i].byAttempt.push({ attemptId: a.id, answerSummary: r.answerSummary, improve: r.improve })
    }
    if (unmatched.length > 0) other.push({ attemptId: a.id, reviews: unmatched })
  }
  return { questions, other }
}
