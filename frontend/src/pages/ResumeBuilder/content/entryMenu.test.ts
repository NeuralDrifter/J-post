// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce } from 'immer'
import { describe, expect, it, vi } from 'vitest'
import { resolveSection } from '@reactive-resume/web/features/resume/editor/write/model'
import type { MenuEntry, MenuItem } from '../../../lib/menu'
import { newResumeData } from '../../../lib/resumes/document'
import { moveEntry, moveToMenu } from './entryMenu'

const sample = newResumeData('sample', 'azurill')
const experience = resolveSection(sample, 'experience')!
const firstJob = sample.sections.experience.items[0]!

const items = (entries: MenuEntry[] | undefined) => (entries ?? []).filter((e): e is MenuItem => e !== 'separator')

describe('Move to…', () => {
  it('offers a new section on each page and a new page', () => {
    const menu = moveToMenu(sample, experience, () => undefined) as MenuItem
    const pages = items(menu.submenu)
    expect(pages.map((p) => p.label)).toEqual([...sample.metadata.layout.pages.map((_, i) => `Page ${i + 1}`), 'New page'])
    expect(items(pages[0]!.submenu).at(-1)?.label).toBe('New section')
  })

  it('moves an entry into a new section and out of its old one', () => {
    const moved = produce(sample, moveEntry(experience, firstJob.id, { type: 'new-section', title: 'Experience', pageIndex: 0 }))
    expect(moved.sections.experience.items.map((i) => i.id)).not.toContain(firstJob.id)
    const created = moved.customSections.at(-1)!
    expect(created.items.map((i) => i.id)).toEqual([firstJob.id])
    expect(moved.metadata.layout.pages[0]!.main).toContain(created.id)
  })

  it('passes the chosen target to the move', () => {
    const move = vi.fn()
    const menu = moveToMenu(sample, experience, move) as MenuItem
    items(menu.submenu).at(-1)!.onSelect!()
    expect(move).toHaveBeenCalledWith({ type: 'new-page', title: expect.any(String) })
  })
})
