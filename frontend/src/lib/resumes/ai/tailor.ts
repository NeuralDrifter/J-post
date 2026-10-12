// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Tailor: what is sent to make a resume speak to one posting, and what is kept to ask again about one section.

import type { Passage } from '@reactive-resume/resume/proposals'
import { describeEntry, getSectionType, type Entry } from '@reactive-resume/web/features/resume/editor/write/model'
import type { ResumeData } from '../document'
import { BASICS_SECTION } from './resumeChanges'

/** The posting's key terms, split by whether the resume uses them already. */
export type TailorTerms = { found: string[]; missing: string[] }

/** Kept with a tailor run: the passages sent (so their ids resolve later) and the terms it worked from. */
export type TailorContext = { passages: Passage[]; terms: TailorTerms }

export type TailorFocus = { section?: string; avoid?: readonly string[] }

const SKILLS = 'skills'

/** Every entry by section, with its title, so edits can name one. */
function entriesOf(data: ResumeData, section?: string) {
  const sections = [
    ...Object.entries(data.sections).map(([id, s]) => ({ id, items: s.items as Entry[] })),
    ...data.customSections.map((s) => ({ id: s.id, items: s.items as Entry[] })),
  ].filter((s) => !section || s.id === section)
  return sections.flatMap(({ id, items }) => {
    const type = getSectionType(data, id)
    return type ? items.filter((item) => !item.hidden).map((item) => ({ sectionId: id, itemId: item.id, title: describeEntry(type, item).title })) : []
  })
}

/** The material for a tailor run: the whole resume, or one section of it (`focus.section`). */
export function tailorMaterial(data: ResumeData, passages: readonly Passage[], terms: TailorTerms, focus: TailorFocus = {}): { input: string; context: string } {
  const { section, avoid = [] } = focus
  const sent = section ? passages.filter((p) => p.target.sectionId === section) : [...passages]
  const wants = (id: string) => !section || section === id
  const input = {
    passages: sent.map((p) => ({ id: p.id, location: p.location, text: p.text })),
    ...(wants(BASICS_SECTION) ? { headline: data.basics.headline } : {}),
    ...(wants(SKILLS) ? { skills: data.sections.skills.items.filter((s) => !s.hidden).map((s) => ({ id: s.id, name: s.name, keywords: s.keywords })) } : {}),
    entries: entriesOf(data, section === BASICS_SECTION || section === SKILLS ? undefined : section),
    terms,
    ...(section ? { focusSection: section } : {}),
    avoid,
  }
  const context: TailorContext = { passages: sent, terms }
  return { input: JSON.stringify(input), context: JSON.stringify(context) }
}

export function parseTailorTerms(context: string): TailorTerms {
  try {
    const terms = (JSON.parse(context) as Partial<TailorContext>).terms
    return { found: terms?.found ?? [], missing: terms?.missing ?? [] }
  } catch {
    return { found: [], missing: [] }
  }
}

/** How much of the posting the resume covers: the share of its key terms used, as a whole percent. */
export const termCoverage = (found: number, total: number) => (total === 0 ? 0 : Math.round((found / total) * 100))

/** The coverage a tailor run started from: the share of its posting's terms the resume used then. */
export const coverageOf = (terms: TailorTerms) => termCoverage(terms.found.length, terms.found.length + terms.missing.length)
