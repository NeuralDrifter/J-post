// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Edits to where sections sit: which page, which column, in what order.
import type { Draft } from 'immer'
import type { ResumeData } from '../../../lib/resumes/document'

export type Column = 'main' | 'sidebar'

type Pages = Draft<ResumeData>['metadata']['layout']['pages']

const pagesOf = (draft: Draft<ResumeData>): Pages => draft.metadata.layout.pages

function removeEverywhere(pages: Pages, id: string) {
  for (const page of pages) {
    page.main = page.main.filter((section) => section !== id)
    page.sidebar = page.sidebar.filter((section) => section !== id)
  }
}

/** Puts a section at the end of a page's column, taking it from wherever it was. */
export function moveToColumn(draft: Draft<ResumeData>, id: string, pageIndex: number, column: Column) {
  const pages = pagesOf(draft)
  const target = pages[pageIndex]
  if (!target) return
  removeEverywhere(pages, id)
  target[column].push(id)
}

/** Moves a section one place up (-1) or down (+1) in its column; at either end nothing changes. */
export function moveInColumn(draft: Draft<ResumeData>, pageIndex: number, column: Column, id: string, direction: -1 | 1) {
  const list = pagesOf(draft)[pageIndex]?.[column]
  if (!list) return
  const from = list.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= list.length) return
  list.splice(from, 1)
  list.splice(to, 0, id)
}

export function addPage(draft: Draft<ResumeData>) {
  pagesOf(draft).push({ fullWidth: false, main: [], sidebar: [] })
}

/** Removes a page; its sections move to the end of the page before it (or after it, for the first page). */
export function removePage(draft: Draft<ResumeData>, pageIndex: number) {
  const pages = pagesOf(draft)
  if (pages.length <= 1) return
  const [removed] = pages.splice(pageIndex, 1)
  const neighbour = pages[Math.max(0, pageIndex - 1)]
  if (!removed || !neighbour) return
  neighbour.main.push(...removed.main)
  neighbour.sidebar.push(...removed.sidebar)
}
