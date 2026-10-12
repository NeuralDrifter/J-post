// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Track Changes by section: each section lists the AI runs that suggested
// something for it (its versions, oldest first) and shows one of them.

import type { app } from '../../backend'
import type { Change } from './changes'

export type CompiledGeneration<T> = { gen: app.AIGeneration; changes: Change<T>[]; dropped: number }

export type SectionReview<T> = {
  sectionId: string
  /** The runs with changes here, oldest first: the ‹ 2 / 3 › switcher. */
  versions: CompiledGeneration<T>[]
  shown: CompiledGeneration<T>
  /** The shown run's changes in this section. */
  changes: Change<T>[]
  pending: number
}

const inSection = <T>(compiled: CompiledGeneration<T>, sectionId: string) => compiled.changes.filter((c) => c.sectionId === sectionId)
const countPending = <T>(changes: readonly Change<T>[]) => changes.filter((c) => c.status === 'pending').length

/**
 * Every section with suggestions. A section shows the run picked for it, else the newest run with changes still
 * waiting there, else its newest run.
 */
export function sectionReviews<T>(compiled: readonly CompiledGeneration<T>[], picked: Readonly<Record<string, string>>): SectionReview<T>[] {
  const sectionIds = [...new Set(compiled.flatMap((c) => c.changes.map((change) => change.sectionId)))]
  return sectionIds.map((sectionId) => {
    const versions = compiled.filter((c) => inSection(c, sectionId).length > 0)
    const waiting = versions.filter((c) => countPending(inSection(c, sectionId)) > 0)
    const shown = versions.find((c) => c.gen.id === picked[sectionId]) ?? waiting.at(-1) ?? versions.at(-1)!
    const changes = inSection(shown, sectionId)
    return { sectionId, versions, shown, changes, pending: countPending(changes) }
  })
}

export const totalPending = <T>(reviews: readonly SectionReview<T>[]) => reviews.reduce((sum, r) => sum + r.pending, 0)

/** What a regenerate should not suggest again: every version's text here that wasn't accepted. */
export function textsToAvoid<T>(review: SectionReview<T>): string[] {
  const unwanted = review.versions.flatMap((v) => inSection(v, review.sectionId)).filter((c) => c.status !== 'accepted' && c.after)
  return [...new Set(unwanted.map((c) => c.after))]
}

/** The run's other generations in a section: is there anything to step to? */
export function versionPosition<T>(review: SectionReview<T>): { index: number; count: number } {
  return { index: review.versions.indexOf(review.shown), count: review.versions.length }
}
