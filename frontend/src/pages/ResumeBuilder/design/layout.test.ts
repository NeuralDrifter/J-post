// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { newResumeData, type ResumeData } from '../../../lib/resumes/document'
import { addPage, moveInColumn, moveToColumn, removePage } from './layout'

function withPages(pages: ResumeData['metadata']['layout']['pages']): ResumeData {
  return produce(newResumeData('blank', 'azurill'), (d) => void (d.metadata.layout.pages = pages))
}

const twoPages = withPages([
  { fullWidth: false, main: ['experience', 'education'], sidebar: ['skills'] },
  { fullWidth: false, main: ['projects'], sidebar: [] },
])

describe('layout moves', () => {
  it('moves a section to the other column of a page, at the end', () => {
    const next = produce(twoPages, (d) => moveToColumn(d, 'education', 0, 'sidebar'))
    expect(next.metadata.layout.pages[0]).toMatchObject({ main: ['experience'], sidebar: ['skills', 'education'] })
  })

  it('moves a section to another page', () => {
    const next = produce(twoPages, (d) => moveToColumn(d, 'skills', 1, 'main'))
    expect(next.metadata.layout.pages[0]!.sidebar).toEqual([])
    expect(next.metadata.layout.pages[1]!.main).toEqual(['projects', 'skills'])
  })

  it('moves a section up and down within its column, stopping at the ends', () => {
    const up = produce(twoPages, (d) => moveInColumn(d, 0, 'main', 'education', -1))
    expect(up.metadata.layout.pages[0]!.main).toEqual(['education', 'experience'])
    const stuck = produce(twoPages, (d) => moveInColumn(d, 0, 'main', 'experience', -1))
    expect(stuck).toBe(twoPages)
  })

  it('adds an empty page at the end', () => {
    const next = produce(twoPages, (d) => addPage(d))
    expect(next.metadata.layout.pages).toHaveLength(3)
    expect(next.metadata.layout.pages[2]).toEqual({ fullWidth: false, main: [], sidebar: [] })
  })

  it("removes a page and keeps its sections on the page before", () => {
    const next = produce(twoPages, (d) => removePage(d, 1))
    expect(next.metadata.layout.pages).toHaveLength(1)
    expect(next.metadata.layout.pages[0]!.main).toEqual(['experience', 'education', 'projects'])
  })

  it('never removes the only page', () => {
    const one = withPages([{ fullWidth: false, main: ['experience'], sidebar: [] }])
    expect(produce(one, (d) => removePage(d, 0))).toBe(one)
  })
})
