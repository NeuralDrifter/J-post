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
