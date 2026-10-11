// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Job match: which of a posting's terms the resume uses. It isn't part of
// the score. Follows Reactive Resume's Check → Job match (MIT).
import type { PageMapTarget } from '@reactive-resume/pdf/page-map'
import type { JdTermMatch } from '@reactive-resume/resume/ats-pdf'
import { buildMarkdown } from '@reactive-resume/resume/markdown'
import { findEntry } from '@reactive-resume/web/features/resume/editor/write/model'
import type { ResumeData } from '../../../lib/resumes/document'

/** A posting term, labelled as the posting writes it ("C#" rather than the matcher's "csharp"). */
export type MatchedTerm = JdTermMatch & { label: string }

export type JobMatchResult = { found: MatchedTerm[]; missing: MatchedTerm[]; total: number }

/** Reactive Resume's posting reader. It's loaded only once there's a posting to read. */
export type Matcher = Pick<typeof import('@reactive-resume/resume/ats-pdf'), 'matchJobDescription' | 'surfaceFormsOf'>

export const loadMatcher = (): Promise<Matcher> => import('@reactive-resume/resume/ats-pdf')

/** Sorts a posting's terms into those the resume uses and those it doesn't, leaving out hidden ones. */
export function matchPosting(matcher: Matcher, posting: string, data: ResumeData): JobMatchResult {
  const hidden = new Set(data.metadata.check?.hiddenTerms ?? [])
  const terms = matcher
    .matchJobDescription({ jobDescription: posting, resumeText: buildMarkdown(data) })
    .terms.filter((term) => !hidden.has(term.term))
    .map((term) => ({ ...term, label: termAsWritten(matcher.surfaceFormsOf(term.term), posting) ?? term.term }))
  return { found: terms.filter((t) => t.resumeCount > 0), missing: terms.filter((t) => t.resumeCount === 0), total: terms.length }
}

/** The first spelling of a term the posting uses, as it writes it ("Figma", not "figma"). */
export function termAsWritten(forms: readonly string[], posting: string): string | undefined {
  for (const form of forms) {
    const found = posting.match(new RegExp(escapeRegExp(form), 'i'))?.[0]
    if (found) return found
  }
  return undefined
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type PostingJob = { id: string; resumeId: string; description: string }

/** The jobs a resume can be matched against: those with a posting saved. */
export const jobsWithPostings = <J extends PostingJob>(jobs: readonly J[]): J[] => jobs.filter((job) => job.description.trim() !== '')

/** The job to match first: the one the resume was tailored for, else one that uses it, else none (paste a posting). */
export function defaultPostingJobId(resume: { id: string; jobId: string }, jobs: readonly PostingJob[]): string {
  const choices = jobsWithPostings(jobs)
  const tailoredFor = choices.find((job) => job.id === resume.jobId)
  return (tailoredFor ?? choices.find((job) => job.resumeId === resume.id))?.id ?? ''
}

/** Every string inside a value, joined: what a block of the resume says. */
const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'object' && value ? Object.values(value).map(textOf).join(' ') : ''

/** The blocks that mention a term, to tint on the page: the header, the summary, entries. */
export function blocksMentioning(data: ResumeData, term: string): PageMapTarget[] {
  const needle = term.toLowerCase()
  const mentions = (value: unknown) => textOf(value).toLowerCase().includes(needle)
  const targets: PageMapTarget[] = []
  if (mentions(data.basics)) targets.push({ kind: 'header' })
  if (mentions(data.summary.content)) targets.push({ kind: 'section', sectionId: 'summary' })
  for (const section of entrySections(data)) {
    for (const item of section.items) {
      if (mentions(findEntry(data, section.id, item.id))) targets.push({ kind: 'item', sectionId: section.id, itemId: item.id })
    }
  }
  return targets
}

/** Built-in and custom sections, each with its entries' ids. */
const entrySections = (data: ResumeData) => [
  ...Object.entries(data.sections).map(([id, section]) => ({ id, items: section.items as { id: string }[] })),
  ...data.customSections.map((section) => ({ id: section.id, items: section.items as { id: string }[] })),
]
