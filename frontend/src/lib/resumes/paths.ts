// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Kept free of the resume engine, so any page can link to documents cheaply.

export const RESUME_KIND = 'resume'
export const LETTER_KIND = 'letter'

/** Where a document opens: resumes in the builder, letters in the writer. */
export function documentPath(doc: { id: string; kind: string }): string {
  return doc.kind === LETTER_KIND ? `/letters/${doc.id}` : `/resumes/${doc.id}`
}

/** The value of `?check=` that opens Check on Job match rather than on an issue category. */
export const CHECK_MATCH = 'match'

/** The builder opened on Check: on the first issue of a category ("dates"), or on Job match for a job. */
export function builderCheckPath(resumeId: string, check: string, jobId = ''): string {
  const params = new URLSearchParams({ check })
  if (jobId) params.set('job', jobId)
  return `/resumes/${resumeId}?${params}`
}
