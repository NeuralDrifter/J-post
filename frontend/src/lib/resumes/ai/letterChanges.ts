// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Turns a letter generation's edits into changes against the letter as it is now, and builds what a draft run sends.

import { blockText, collectLetterPassages, LETTER_SECTION_ID, type Passage } from '@reactive-resume/resume/proposals'
import type { app } from '../../backend'
import type { LetterData } from '../letter'
import { changeKey, parseDecisions, structuralStatus, textChange, type Change, type Compiled, type Decisions, type TextField } from './changes'
import { parseEdits, type Edit, type EditOf } from './edits'
import { parseResumeContext } from './resumeChanges'

const LETTER_TITLE = 'Letter'

export const letterPassages = (letter: LetterData): Passage[] =>
  collectLetterPassages(letter.content, { body: LETTER_TITLE, bullet: (n) => `bullet ${n}`, paragraph: (n) => `paragraph ${n}` })

export const letterSectionTitle = () => LETTER_TITLE

const letterField: TextField<LetterData> = {
  read: (letter) => letter.content,
  write: (draft, _passage, value) => {
    draft.content = value
  },
}

const isEmptyBody = (html: string) => blockText(html).trim() === ''

/** A plain-text body (paragraphs split by blank lines) as the letter's HTML. */
export function bodyHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p)}</p>`)
    .join('')
}

export function compileLetterGeneration(letter: LetterData, gen: app.AIGeneration): Compiled<LetterData> {
  const byId = new Map(parseResumeContext(gen.context).passages.map((p) => [p.id, p]))
  const decisions = parseDecisions(gen.decisions)
  const changes: Change<LetterData>[] = []
  let dropped = 0
  parseEdits(gen.edits).forEach((edit, index) => {
    const change = edit && compileEdit(letter, gen, index, decisions, byId, edit)
    if (change) changes.push(change)
    else dropped++
  })
  return { changes, dropped }
}

function compileEdit(letter: LetterData, gen: app.AIGeneration, index: number, decisions: Decisions, byId: Map<string, Passage>, edit: Edit): Change<LetterData> | null {
  switch (edit.kind) {
    case 'rewrite':
    case 'addAfter': {
      const passage = byId.get(edit.passageId)
      return passage ? textChange(letter, gen, index, edit, passage, letterField, decisions) : null
    }
    case 'setBody':
      return setBodyChange(letter, gen, index, decisions, edit)
    default:
      return null
  }
}

/** A whole draft for an empty body. Once the body has text, the draft no longer applies. */
function setBodyChange(letter: LetterData, gen: app.AIGeneration, index: number, decisions: Decisions, edit: EditOf<'setBody'>): Change<LetterData> | null {
  const html = bodyHtml(edit.text)
  if (!html) return null
  const key = changeKey(gen.id, index)
  const applied = letter.content === html
  return {
    key,
    generationId: gen.id,
    sectionId: LETTER_SECTION_ID,
    location: `${LETTER_TITLE} · body`,
    before: '',
    after: blockText(html),
    why: edit.why,
    addsFacts: false,
    status: structuralStatus(decisions[key], applied, applied || isEmptyBody(letter.content)),
    apply: (draft) => {
      if (!isEmptyBody(draft.content)) return false
      draft.content = html
      return true
    },
  }
}

export type LetterTone = 'direct' | 'warm' | 'formal'

export type DraftRequest = { tone: LetterTone; words: { min: number; max: number }; request?: string; avoid?: readonly string[] }

/** What a draft run sends: the body's passages (none when empty) and how to write; the passages are kept as the context. */
export function letterDraftMaterial(letter: LetterData, { tone, words, request = '', avoid = [] }: DraftRequest): { input: string; context: string } {
  const passages = isEmptyBody(letter.content) ? [] : letterPassages(letter)
  const input = { passages: passages.map((p) => ({ id: p.id, location: p.location, text: p.text })), tone, words, request, avoid }
  return { input: JSON.stringify(input), context: JSON.stringify({ passages, tone, words, request }) }
}

/** Asks for the draft again, as it was asked, minus what was turned down. */
export function letterDraftAgain(letter: LetterData, context: string, avoid: readonly string[]): { input: string; context: string } {
  const asked = parseDraftContext(context)
  return letterDraftMaterial(letter, { ...asked, avoid })
}

const DEFAULT_WORDS = { min: 180, max: 320 }

function parseDraftContext(context: string): DraftRequest {
  try {
    const parsed = JSON.parse(context) as Partial<DraftRequest>
    return { tone: parsed.tone ?? 'direct', words: parsed.words ?? DEFAULT_WORDS, request: parsed.request ?? '' }
  } catch {
    return { tone: 'direct', words: DEFAULT_WORDS }
  }
}
