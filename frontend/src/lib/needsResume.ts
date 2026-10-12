// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// When a feature needs a resume and there's none to read, the backend fails
// with a "needs-resume:" error. Instead of a toast, the app asks the user for
// the one step that fixes it, picked from the state of their library.

const PREFIX = 'needs-resume:'
const EVENT = 'jobtrack:needs-resume'

/** jobResumeId: the resume chosen for the job at hand, when there is one. */
export type NeedsResumeRequest = { jobResumeId?: string }

/** What to offer: pick a default from existing resumes, restore the job's trashed one, or make the first. */
export type NeedsResumeStep = { kind: 'choose-default' } | { kind: 'restore'; resumeId: string; name: string } | { kind: 'create' }

export const isNeedsResume = (message: string) => message.startsWith(PREFIX)

/** The error's text for people, without its marker. */
export const needsResumeText = (message: string) => message.slice(PREFIX.length).trim()

export function requestNeedsResume(request: NeedsResumeRequest = {}) {
  window.dispatchEvent(new CustomEvent<NeedsResumeRequest>(EVENT, { detail: request }))
}

export function onNeedsResume(listener: (request: NeedsResumeRequest) => void): () => void {
  const handle = (e: Event) => listener((e as CustomEvent<NeedsResumeRequest>).detail)
  window.addEventListener(EVENT, handle)
  return () => window.removeEventListener(EVENT, handle)
}

type Library = { live: readonly { id: string }[]; trashed: readonly { id: string; name: string }[]; jobResumeId?: string }

/** The job's own resume in the Trash comes first: restoring it is what the user most likely wants. */
export function needsResumeStep({ live, trashed, jobResumeId }: Library): NeedsResumeStep {
  const jobResume = jobResumeId ? trashed.find((d) => d.id === jobResumeId) : undefined
  if (jobResume) return { kind: 'restore', resumeId: jobResume.id, name: jobResume.name }
  return live.length > 0 ? { kind: 'choose-default' } : { kind: 'create' }
}

/** A link that comes back here afterwards: `?return=` carries the current location. */
export function withReturn(path: string, back: string): string {
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}return=${encodeURIComponent(back)}`
}

/** Where a page's Back goes: the `?return=` location when it's one of ours, else the page's usual place. */
export function returnTarget(search: string, fallback: { to: string; label: string }): { to: string; label: string } {
  const back = new URLSearchParams(search).get('return')
  return back?.startsWith('/') && !back.startsWith('//') ? { to: back, label: 'Back' } : fallback
}

/** True when one of the ids (the job's resume, the default) names a resume that's still in the library. */
export const hasUsableResume = (live: readonly { id: string }[], ids: readonly string[]) => live.some((d) => d.id !== '' && ids.includes(d.id))
