// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Kept free of the resume engine, so any page can link to documents cheaply.

export const RESUME_KIND = 'resume'
export const LETTER_KIND = 'letter'

/** Where a document opens: resumes in the builder, letters in the writer. */
export function documentPath(doc: { id: string; kind: string }): string {
  return doc.kind === LETTER_KIND ? `/letters/${doc.id}` : `/resumes/${doc.id}`
}
