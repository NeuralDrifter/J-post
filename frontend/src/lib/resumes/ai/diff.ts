// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { diffWords } from 'diff'

/** A run of text in a change: kept, added or removed, as Track Changes shows it. */
export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string }

/** The words removed and added between two texts, in reading order. */
export function wordDiff(before: string, after: string): DiffPart[] {
  return diffWords(before, after).map((part) => ({
    kind: part.added ? 'added' : part.removed ? 'removed' : 'same',
    text: part.value,
  }))
}

// "[x]%", "[number]", "[2024]": a figure the model left for the user to fill in.
const PLACEHOLDER = /\[[^\]\n]{1,24}\]/g

/** Splits text into plain runs and placeholders, so the placeholders can be highlighted. */
export function splitPlaceholders(text: string): { text: string; placeholder: boolean }[] {
  const parts: { text: string; placeholder: boolean }[] = []
  let last = 0
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), placeholder: false })
    parts.push({ text: match[0], placeholder: true })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false })
  return parts
}

export const hasPlaceholder = (text: string) => splitPlaceholders(text).some((part) => part.placeholder)
