// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { newResumeData, type ResumeData } from '../../../lib/resumes/document'
import { fitDesign, overflowOf } from './fit'

const sample = produce(newResumeData('sample', 'onyx'), (d) => {
  d.metadata.layout.pages = d.metadata.layout.pages.slice(0, 1)
  d.metadata.typography.body.fontSize = 11
})

/** A pretend renderer: the page count falls as the design tightens. */
const pagesFor = (data: ResumeData) => (data.metadata.typography.body.fontSize <= 10 && data.metadata.page.marginX <= 10 ? 1 : 2)

describe('fit to one page', () => {
  it('says when content runs past the authored pages', () => {
    expect(overflowOf(sample, 2)).toEqual({ authored: 1 })
    expect(overflowOf(sample, 1)).toBeNull()
    expect(overflowOf(produce(sample, (d) => void (d.metadata.page.format = 'free-form')), 3)).toBeNull()
  })

  it('tightens density, then margins, then text size until it fits', async () => {
    const { metadata, fits } = await fitDesign(sample, async (d) => pagesFor(d))
    expect(fits).toBe(true)
    expect(metadata.page.marginX).toBe(10)
    expect(metadata.typography.body.lineHeight).toBe(1.35)
    expect(metadata.typography.body.fontSize).toBe(10)
  })

  it('stops at the smallest text when nothing more fits', async () => {
    const { metadata, fits } = await fitDesign(sample, async () => 3)
    expect(fits).toBe(false)
    expect(metadata.typography.body.fontSize).toBe(9)
  })

  it('leaves a resume that already fits alone', async () => {
    const { metadata, fits } = await fitDesign(sample, async () => 1)
    expect(fits).toBe(true)
    expect(metadata).toBe(sample.metadata)
  })
})
