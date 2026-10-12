// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// A change is one edit from a generation, worked out against the document as
// it is now: what it would change (as text, for the diff), where, why, and
// how to apply it inside an editor update.

import type { Draft } from 'immer'
import { additionAfter, applyTo, getStateIn, replaceBlockText, type Passage, type Proposal } from '@reactive-resume/resume/proposals'
import type { app } from '../../backend'
import type { EditOf } from './edits'
import { markChange } from './pageMarks'

export type ChangeStatus = 'pending' | 'accepted' | 'rejected' | 'stale'
export type Decision = 'accepted' | 'rejected'
export type Decisions = Readonly<Record<string, Decision>>

export type Change<T> = {
  /** `<generation id>:<edit index>`: stable, so a decision finds its change again. */
  key: string
  generationId: string
  /** The section it belongs to: a section id, "basics", or the letter's body. */
  sectionId: string
  /** Where it lands, for people: "Experience · Acme · bullet 2". */
  location: string
  /** What it reads as before and after, as plain text for the word diff. */
  before: string
  after: string
  why: string
  /** It states something the document didn't, so the user should check it's true. */
  addsFacts: boolean
  status: ChangeStatus
  /** Makes the change inside an editor update; false (changing nothing) when it no longer fits. */
  apply: (draft: Draft<T>) => boolean
  /** Shows the change on the page preview (old text struck, new highlighted); text changes only. */
  markOnPage?: (draft: Draft<T>) => void
}

export type Compiled<T> = { changes: Change<T>[]; dropped: number }

export const changeKey = (generationId: string, index: number) => `${generationId}:${index}`

export function parseDecisions(json: string): Decisions {
  try {
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Decisions) : {}
  } catch {
    return {}
  }
}

/** For changes that aren't a passage's text: done, out of date, or waiting, by what the document says now. */
export function structuralStatus(decision: Decision | undefined, applied: boolean, applicable: boolean): ChangeStatus {
  if (decision === 'rejected') return 'rejected'
  if (applied) return 'accepted'
  return applicable ? 'pending' : 'stale'
}

/** Where a text field lives in a document, so one kind of change serves resumes and letters. */
export type TextField<T> = { read: (doc: T, passage: Passage) => string | undefined; write: (draft: Draft<T>, passage: Passage, value: string) => void }

type TextEdit = EditOf<'rewrite'> | EditOf<'addAfter'>

/**
 * A rewrite of a passage, or a new block after it, as upstream's proposals work: the passage must still be in the
 * field word for word, or the change is out of date. Null when the edit changes nothing.
 */
export function textChange<T>(doc: T, gen: app.AIGeneration, index: number, edit: TextEdit, passage: Passage, field: TextField<T>, decisions: Decisions): Change<T> | null {
  const text = edit.text.trim()
  if (!text || (edit.kind === 'rewrite' && text === passage.text)) return null
  const value = field.read(doc, passage) ?? ''
  const swap = edit.kind === 'rewrite' ? { before: passage.html, after: replaceBlockText(passage.html, text) } : additionAfter(value, passage.html, text)
  if (!swap) return null
  const key = changeKey(gen.id, index)
  const decision = decisions[key]
  const proposal = { ...swap, status: decision ?? 'pending' } as Proposal
  return {
    key,
    generationId: gen.id,
    sectionId: passage.target.sectionId,
    location: edit.kind === 'rewrite' ? passage.location : `${passage.location} · new line after it`,
    before: edit.kind === 'rewrite' ? passage.text : '',
    after: text,
    why: edit.why,
    addsFacts: edit.addsFacts,
    status: getStateIn(value, proposal),
    apply: (draft) => {
      const next = applyTo(field.read(draft as T, passage), swap)
      if (next === undefined) return false
      field.write(draft, passage, next)
      return true
    },
    markOnPage: (draft) => {
      const marked = applyTo(field.read(draft as T, passage), { before: swap.before, after: markChange(swap.before, swap.after) })
      if (marked !== undefined) field.write(draft, passage, marked)
    },
  }
}
