// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Improve a line: what the user can ask for, and what is sent for one line.

import type { Passage, ProposalTarget } from '@reactive-resume/resume/proposals'

export const IMPROVE_ACTIONS = [
  { id: 'verb', label: 'Stronger verb' },
  { id: 'result', label: 'Add a result' },
  { id: 'shorter', label: 'Make it shorter' },
] as const

export type ImproveAction = (typeof IMPROVE_ACTIONS)[number]['id'] | 'custom'

/** The context kept with an improve run: the line it was about, and how it was asked. */
export type ImproveContext = { passages: Passage[]; action: ImproveAction; request: string }

/** One field of a document, as a key: the same field in two places always has the same key. */
export const fieldKeyOf = (t: ProposalTarget) => [t.sectionId, t.itemId ?? '', t.roleId ?? '', t.field].join('|')

/** The passage in this field whose text is the line, or none (an empty line, or text not in the field). */
export function linePassage(passages: readonly Passage[], target: ProposalTarget, line: string): Passage | undefined {
  const text = line.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return passages.find((p) => fieldKeyOf(p.target) === fieldKeyOf(target) && p.text === text)
}

/** What the model reads: the line, the ask, where it sits, the rest of its field, and texts already turned down. */
export function improveInput(passage: Passage, all: readonly Passage[], action: ImproveAction, request: string, avoid: readonly string[] = []): string {
  const key = fieldKeyOf(passage.target)
  return JSON.stringify({
    action,
    ...(action === 'custom' ? { request } : {}),
    where: passage.location,
    line: { id: passage.id, text: passage.text },
    field: all
      .filter((p) => fieldKeyOf(p.target) === key)
      .map((p) => p.text)
      .join('\n'),
    avoid,
  })
}

export function parseImproveContext(json: string): ImproveContext | null {
  try {
    const parsed = JSON.parse(json) as Partial<ImproveContext>
    return Array.isArray(parsed.passages) && parsed.passages.length && parsed.action ? (parsed as ImproveContext) : null
  } catch {
    return null
  }
}

/** Asks about the same line again, while it still reads as it did; null once it has changed. */
export function improveAgain(context: string, passages: readonly Passage[], avoid: readonly string[]): { input: string; context: string } | null {
  const asked = parseImproveContext(context)
  const passage = asked && passages.find((p) => p.id === asked.passages[0].id)
  if (!asked || !passage) return null
  return { input: improveInput(passage, passages, asked.action, asked.request, avoid), context }
}
