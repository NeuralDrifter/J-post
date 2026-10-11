// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce, type Draft } from 'immer'
import { describe, expect, it } from 'vitest'
import { getSectionObject, resolveSection } from '@reactive-resume/web/features/resume/editor/write/model'
import type { MenuEntry, MenuItem } from '../../../lib/menu'
import { newResumeData, type ResumeData } from '../../../lib/resumes/document'
import { sectionMenu } from './sectionMenu'

function menuFor(data: ResumeData, sectionId: string, apply: (recipe: (d: Draft<ResumeData>) => void) => void) {
  const section = resolveSection(data, sectionId)!
  return sectionMenu({ section, settings: getSectionObject(data, section)!, title: sectionId, update: apply, onEntryAdded: () => undefined, onPickIcon: () => undefined })
}

const find = (entries: MenuEntry[] | undefined, label: string) => (entries ?? []).find((e): e is MenuItem => e !== 'separator' && e.label.startsWith(label))

describe('section menu', () => {
  const data = newResumeData('sample', 'onyx')

  it('offers 1 to 6 columns', () => {
    const columns = find(menuFor(data, 'experience', () => undefined), 'Columns')!
    expect(columns.submenu).toHaveLength(6)
    expect(find(menuFor(data, 'experience', () => undefined), 'Keyword layout')).toBeUndefined()
  })

  it('lets skills sit inline in one column', () => {
    let next = data
    const columns = find(menuFor(data, 'skills', (recipe) => (next = produce(next, recipe))), 'Columns')!
    find(columns.submenu, '1 column, inline')!.onSelect!()
    expect(next.sections.skills).toMatchObject({ columns: 1, layout: 'inline' })
  })

  it('sets how skill keywords print', () => {
    let next = data
    const layout = find(menuFor(data, 'skills', (recipe) => (next = produce(next, recipe))), 'Keyword layout')!
    find(layout.submenu, 'Bulleted list')!.onSelect!()
    expect(next.sections.skills.keywordLayout).toBe('list')
  })
})
