// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Writing review: what is sent to have every passage (or one section's) read for weak writing.

import type { Passage } from '@reactive-resume/resume/proposals'

export type ReviewFocus = { section?: string; avoid?: readonly string[] }

/** The material for a writing review; the passages sent are kept as the context so their ids resolve later. */
export function writingReviewMaterial(passages: readonly Passage[], focus: ReviewFocus = {}): { input: string; context: string } | null {
  const { section, avoid = [] } = focus
  const sent = section ? passages.filter((p) => p.target.sectionId === section) : [...passages]
  if (sent.length === 0) return null
  const input = { passages: sent.map((p) => ({ id: p.id, location: p.location, text: p.text })), ...(section ? { focusSection: section } : {}), avoid }
  return { input: JSON.stringify(input), context: JSON.stringify({ passages: sent }) }
}
