// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { NO_PLAN_PROVIDER } from '../../generated/choices'
import type { app } from '../../lib/backend'

/** The interview being retried with the same question plan. */
export type RetryInfo = { id: string; kind: string; minutes: number; startedAt: string }

export function initialSetup(job: app.Job, retry?: RetryInfo): app.InterviewSetup {
  return {
    kind: retry?.kind ?? (job.status === 'interviewing' ? 'behavioral' : 'phone_screen'),
    minutes: retry?.minutes ?? 25,
    persona: 'neutral',
    voice: '', // surprise me
    interviewerName: '',
    focus: '',
    planProvider: '', // the setting
    retryOf: retry?.id ?? '',
  }
}

/** The Start button while s is being prepared. A retry or "no plan" writes no plan, so it just starts. */
export function preparingLabel(providerLabel: string, s: app.InterviewSetup): string {
  return s.retryOf || s.planProvider === NO_PLAN_PROVIDER ? 'Starting…' : `Preparing your questions with ${providerLabel}…`
}

/**
 * The modal's close handler. While the interview is being prepared (planning can
 * take minutes) closing is ignored: otherwise the session would still start, and
 * open the live page, after the user had walked away.
 */
export function closeUnlessStarting(starting: boolean, onClose: () => void): () => void {
  return starting ? () => {} : onClose
}
