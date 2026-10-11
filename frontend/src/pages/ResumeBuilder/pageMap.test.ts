// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { boxStyle, firstNodeFor, marginStyle, nodeAt, nodesOnPage, placeMarkers, toPagePoint, type PageMap, type PageMapNode } from './pageMap'

const header: PageMapNode = { kind: 'header', key: 'header', page: 0, x: 40, y: 40, width: 500, height: 80 }
const experience: PageMapNode = { kind: 'section', sectionId: 'experience', key: 'exp', page: 0, x: 40, y: 140, width: 500, height: 400 }
const job: PageMapNode = { kind: 'item', sectionId: 'experience', itemId: 'job1', key: 'job1', page: 0, x: 40, y: 170, width: 500, height: 120 }
const jobContinued: PageMapNode = { ...job, key: 'job1b', page: 1, y: 40 }
const pageMap: PageMap = { pages: [{ width: 600, height: 800 }, { width: 600, height: 800 }], nodes: [header, experience, job, jobContinued] }

describe('page map', () => {
  it('finds where a target starts', () => {
    expect(firstNodeFor(pageMap, { kind: 'item', sectionId: 'experience', itemId: 'job1' })).toBe(job)
    expect(firstNodeFor(pageMap, { kind: 'item', sectionId: 'experience', itemId: 'nope' })).toBeUndefined()
  })

  it('lists a target’s boxes on one page only', () => {
    expect(nodesOnPage(pageMap, 1, { kind: 'item', sectionId: 'experience', itemId: 'job1' })).toEqual([jobContinued])
  })

  it('picks the innermost block under a click', () => {
    expect(nodeAt(pageMap, 0, 100, 200)).toBe(job)
    expect(nodeAt(pageMap, 0, 100, 400)).toBe(experience)
    expect(nodeAt(pageMap, 0, 100, 60)).toBe(header)
    expect(nodeAt(pageMap, 0, 5, 5)).toBeUndefined()
  })

  it('converts a click on a page drawn at any size to PDF points', () => {
    expect(toPagePoint({ x: 160, y: 420 }, { left: 10, top: 20, width: 300, height: 400 }, { width: 600, height: 800 })).toEqual({ x: 300, y: 800 })
  })

  it('places boxes in percentages of the page', () => {
    expect(boxStyle(header, { width: 600, height: 800 })).toEqual({ left: '6.666666666666667%', top: '5%', width: '83.33333333333334%', height: '10%' })
  })

  it('stacks margin markers', () => {
    expect(marginStyle(header, { width: 600, height: 800 }, 2).top).toBe('calc(5% - 3px + 52px)')
  })

  it('places markers on the page their block starts, stacked per block', () => {
    const items = [
      { id: 'a', target: { kind: 'header' as const } },
      { id: 'b', target: { kind: 'header' as const } },
      { id: 'c', target: null },
      { id: 'd', target: { kind: 'item' as const, sectionId: 'experience', itemId: 'job1' } },
    ]
    expect(placeMarkers(items, pageMap, 0).map((m) => [m.item.id, m.stack])).toEqual([['a', 0], ['b', 1], ['d', 0]])
    expect(placeMarkers(items, pageMap, 1)).toEqual([])
  })
})
