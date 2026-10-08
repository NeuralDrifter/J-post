import type { main } from '../../lib/backend'

/** The interview being retried with the same question plan. */
export type RetryInfo = { id: string; kind: string; minutes: number; startedAt: string }

export function initialSetup(job: main.Job, retry?: RetryInfo): main.InterviewSetup {
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

/** The Start button while the session is being prepared. No plan is written for a retry. */
export function preparingLabel(providerLabel: string, retry: boolean): string {
  return retry ? 'Starting…' : `Preparing your questions with ${providerLabel}…`
}

/**
 * The modal's close handler. While the interview is being prepared (planning can
 * take minutes) closing is ignored: otherwise the session would still start, and
 * open the live page, after the user had walked away.
 */
export function closeUnlessStarting(starting: boolean, onClose: () => void): () => void {
  return starting ? () => {} : onClose
}
