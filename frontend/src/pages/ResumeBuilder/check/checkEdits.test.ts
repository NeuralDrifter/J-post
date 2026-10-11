// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { newResumeData } from '../../../lib/resumes/document'
import { addSkill, hideTerm, ignoreIssue, restoreHiddenTerms, restoreIgnoredIssues } from './checkEdits'

const blank = newResumeData('blank', 'azurill')

describe('Check edits', () => {
  it('ignores an issue once, creating the Check state on first use', () => {
    expect(blank.metadata.check).toBeUndefined()
    const twice = produce(produce(blank, ignoreIssue('MISSING_PHONE:')), ignoreIssue('MISSING_PHONE:'))
    expect(twice.metadata.check).toEqual({ ignored: ['MISSING_PHONE:'], hiddenTerms: [] })
  })

  it('brings ignored issues back', () => {
    const ignored = produce(blank, ignoreIssue('a'))
    expect(produce(ignored, restoreIgnoredIssues).metadata.check?.ignored).toEqual([])
  })

  it('hides a term once and shows hidden terms again', () => {
    const hidden = produce(produce(blank, hideTerm('kubernetes')), hideTerm('kubernetes'))
    expect(hidden.metadata.check?.hiddenTerms).toEqual(['kubernetes'])
    expect(produce(hidden, restoreHiddenTerms).metadata.check?.hiddenTerms).toEqual([])
  })

  it('adds a skill by name', () => {
    const added = produce(blank, addSkill('Kubernetes'))
    expect(added.sections.skills.items.at(-1)).toMatchObject({ name: 'Kubernetes', hidden: false, keywords: [] })
  })
})
