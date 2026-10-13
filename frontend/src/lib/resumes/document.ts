// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// A resume as J-POST stores it: Reactive Resume's JSON, checked against its
// schema on the way in and out, plus the plain text the AI features read.
import { buildMarkdown } from '@reactive-resume/resume/markdown'
import { parseResumeData, type ResumeData } from '@reactive-resume/schema/resume/data'
import { defaultResumeData } from '@reactive-resume/schema/resume/default'
import { sampleResumeData } from '@reactive-resume/schema/resume/sample'
import type { Template } from '@reactive-resume/schema/templates'
import { ZodError } from 'zod'

export type { ResumeData, Template }

export type ResumeStart = 'blank' | 'sample'

export type ParsedResume = { ok: true; data: ResumeData } | { ok: false; error: string }

const STARTING_CONTENT: Record<ResumeStart, ResumeData> = { blank: defaultResumeData, sample: sampleResumeData }

/** A new resume: empty or Reactive Resume's sample content, on the chosen template, in canonical form. */
export function newResumeData(start: ResumeStart, template: Template): ResumeData {
  const data = structuredClone(STARTING_CONTENT[start])
  data.metadata.template = template
  return parseResumeData(data)
}

export function serializeResume(data: ResumeData): string {
  return JSON.stringify(data)
}

/** Reads a stored resume. A document that no longer fits the schema is reported, never repaired silently. */
export function parseStoredResume(json: string): ParsedResume {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'The saved resume is not valid JSON.' }
  }
  try {
    return { ok: true, data: parseResumeData(raw) }
  } catch (err) {
    return { ok: false, error: describeSchemaError(err) }
  }
}

function describeSchemaError(err: unknown): string {
  if (!(err instanceof ZodError)) return err instanceof Error ? err.message : String(err)
  const first = err.issues[0]
  const where = first?.path.join('.') || 'the document'
  return `The saved resume doesn't match the resume format at ${where}: ${first?.message ?? 'invalid value'}.`
}

/** The resume as plain text (Markdown), which mock interviews and match scores read. */
export function resumePlainText(data: ResumeData): string {
  return buildMarkdown(data)
}
