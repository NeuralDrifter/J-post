// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// A cover letter as Job Track stores it: Reactive Resume's cover-letter document,
// drawn by composing it into a one-section resume on the letter's own design.
import type { ResumeRenderOptions } from '@reactive-resume/pdf/context'
import { composeCoverLetter, copyCoverLetterStyle, createCoverLetterResumeData, type LetterWords } from '@reactive-resume/resume/cover-letter'
import { htmlToMarkdown } from '@reactive-resume/resume/markdown'
import { coverLetterDocumentSchema, type CoverLetterDocument } from '@reactive-resume/schema/cover-letter/data'
import { defaultResumeData } from '@reactive-resume/schema/resume/default'
import { ZodError } from 'zod'
import type { ResumeData } from './document'

export type LetterData = CoverLetterDocument

export type ParsedLetter = { ok: true; data: LetterData } | { ok: false; error: string }

/** Letters print their sender's header above the recipient. */
export const LETTER_RENDER_OPTIONS: ResumeRenderOptions = { includeCoverLetterHeader: true }

/** The section title inside the composed page; letters don't print it. */
const LETTER_SECTION_NAME = 'Cover letter'

const LETTER_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The words structured letters are written with (Job Track is English-only). */
export const LETTER_WORDS: LetterWords = {
  greeting: (name) => `Dear ${name},`,
  teamGreeting: 'Dear hiring team,',
  hiringTeam: 'Hiring team',
  signOff: 'Kind regards,',
  formatDate: (date) => LETTER_DATE_FORMAT.format(new Date(`${date}T12:00:00Z`)),
}

/** A new structured letter with the sender details and design of a resume, or blank. */
export function newLetterData(source: ResumeData | null): LetterData {
  return coverLetterDocumentSchema.parse({
    format: 'reactive-resume-cover-letter',
    version: 1,
    name: LETTER_SECTION_NAME,
    recipient: '',
    content: '',
    style: copyCoverLetterStyle(source ?? defaultResumeData),
    layout: 'structured',
    recipientName: '',
    recipientCompany: '',
    letterDate: null,
  })
}

export function serializeLetter(letter: LetterData): string {
  return JSON.stringify(letter)
}

/** Reads a stored letter. A letter that no longer fits the format is reported, never repaired silently. */
export function parseStoredLetter(json: string): ParsedLetter {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'The saved letter is not valid JSON.' }
  }
  const parsed = coverLetterDocumentSchema.safeParse(raw)
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: describe(parsed.error) }
}

function describe(error: ZodError): string {
  const first = error.issues[0]
  return `The saved letter doesn't match the letter format at ${first?.path.join('.') || 'the document'}: ${first?.message ?? 'invalid value'}.`
}

/** The recipient block and body as the page shows them (greeting, date and sign-off added for structured letters). */
export function composedLetter(letter: LetterData): { recipient: string; content: string } {
  return composeCoverLetter(letter, LETTER_WORDS)
}

/** The letter as the page the PDF renderer draws. */
export function letterPageData(letter: LetterData): ResumeData {
  return createCoverLetterResumeData({ ...letter, ...composedLetter(letter) })
}

/** The letter as plain text, which AI features read. */
export function letterPlainText(letter: LetterData): string {
  const { recipient, content } = composedLetter(letter)
  return `${htmlToMarkdown(recipient)}\n\n${htmlToMarkdown(content)}`.trim()
}
