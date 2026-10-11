// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The edits Check makes to a resume, as immer recipes. Each one is a single
// undo step. The author's Check choices live in metadata.check, created on
// first use, as Reactive Resume stores them.
import type { SkillItem } from '@reactive-resume/schema/resume/data'
import { generateId } from '@reactive-resume/utils/string'
import type { ResumeData } from '../../../lib/resumes/document'

type Recipe = (draft: ResumeData) => void

function checkStateOf(draft: ResumeData) {
  draft.metadata.check ??= { ignored: [], hiddenTerms: [] }
  return draft.metadata.check
}

/** Sets an issue aside ("Ignore", or "Keep" for a design choice). */
export const ignoreIssue =
  (key: string): Recipe =>
  (draft) => {
    const state = checkStateOf(draft)
    if (!state.ignored.includes(key)) state.ignored.push(key)
  }

export const restoreIgnoredIssues: Recipe = (draft) => {
  checkStateOf(draft).ignored = []
}

/** Leaves a posting term out of Job match: "not true for me". */
export const hideTerm =
  (term: string): Recipe =>
  (draft) => {
    const state = checkStateOf(draft)
    if (!state.hiddenTerms.includes(term)) state.hiddenTerms.push(term)
  }

export const restoreHiddenTerms: Recipe = (draft) => {
  checkStateOf(draft).hiddenTerms = []
}

/** Adds a posting term to Skills, as the posting writes it. */
export const addSkill =
  (name: string): Recipe =>
  (draft) => {
    draft.sections.skills.items.push(newSkill(name))
  }

const newSkill = (name: string): SkillItem => ({ id: generateId(), hidden: false, icon: '', iconColor: '', name, proficiency: '', level: 0, keywords: [] })
