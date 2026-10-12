// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app } from '../../backend'
import type { Change, ChangeStatus } from './changes'
import { sectionReviews, textsToAvoid, totalPending, versionPosition, type CompiledGeneration } from './review'

function change(gen: string, sectionId: string, after: string, status: ChangeStatus): Change<unknown> {
  return { key: `${gen}:${after}`, generationId: gen, sectionId, location: '', before: 'old', after, why: '', addsFacts: false, status, apply: () => true }
}

const compiled = (id: string, changes: Change<unknown>[]): CompiledGeneration<unknown> => ({ gen: { id } as app.AIGeneration, changes, dropped: 0 })

const first = compiled('g1', [change('g1', 'summary', 'A', 'rejected'), change('g1', 'experience', 'B', 'pending')])
const second = compiled('g2', [change('g2', 'summary', 'C', 'pending')])
const third = compiled('g3', [change('g3', 'summary', 'D', 'accepted')])

describe('sectionReviews', () => {
  it('lists each section once with the runs that touched it', () => {
    const reviews = sectionReviews([first, second, third], {})
    expect(reviews.map((r) => [r.sectionId, r.versions.map((v) => v.gen.id)])).toEqual([
      ['summary', ['g1', 'g2', 'g3']],
      ['experience', ['g1']],
    ])
  })

  it('shows the newest run with changes still waiting, unless one is picked', () => {
    const [summary] = sectionReviews([first, second, third], {})
    expect(summary.shown.gen.id).toBe('g2')
    expect(summary.pending).toBe(1)
    expect(versionPosition(summary)).toEqual({ index: 1, count: 3 })
    expect(sectionReviews([first, second, third], { summary: 'g3' })[0].shown.gen.id).toBe('g3')
  })

  it('counts what is waiting everywhere', () => {
    expect(totalPending(sectionReviews([first, second, third], {}))).toBe(2)
  })

  it('avoids every suggestion here that was not accepted', () => {
    const [summary] = sectionReviews([first, second, third], {})
    expect(textsToAvoid(summary)).toEqual(['A', 'C'])
  })
})
