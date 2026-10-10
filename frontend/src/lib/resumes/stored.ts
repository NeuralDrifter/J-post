// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// How a stored document (a resume or a letter) prints and exports.
import type { ResumeRenderOptions } from '@reactive-resume/pdf/context'
import { parseStoredResume, type ResumeData } from './document'
import { LETTER_RENDER_OPTIONS, letterPageData, parseStoredLetter, type LetterData } from './letter'

export const RESUME_KIND = 'resume'
export const LETTER_KIND = 'letter'

/** What a document prints as: a resume-shaped page and how to render it. */
export type PrintablePage = { data: ResumeData; renderOptions?: ResumeRenderOptions }

/** A document ready to export: its printed page and the JSON it saves as. */
export type Exportable = { name: string; page: PrintablePage; json: unknown }

/** The fields of a stored document needed to read it. */
export type StoredDocument = { kind: string; name: string; data: string }

export function resumeExportable(name: string, data: ResumeData): Exportable {
  return { name, page: { data }, json: data }
}

export function letterExportable(name: string, letter: LetterData): Exportable {
  return { name, page: { data: letterPageData(letter), renderOptions: LETTER_RENDER_OPTIONS }, json: letter }
}

/** Reads a stored document by its kind; a document that no longer reads gives its error. */
export function readStoredDocument(doc: StoredDocument): Exportable | { error: string } {
  if (doc.kind === LETTER_KIND) {
    const parsed = parseStoredLetter(doc.data)
    return parsed.ok ? letterExportable(doc.name, parsed.data) : { error: parsed.error }
  }
  const parsed = parseStoredResume(doc.data)
  return parsed.ok ? resumeExportable(doc.name, parsed.data) : { error: parsed.error }
}
