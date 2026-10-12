// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { sampleResumeData } from '@reactive-resume/schema/resume/sample'
import type { ResumeData } from '../document'
import { resumePassages } from './resumeChanges'
import { writingReviewMaterial } from './writingReview'

const passages = resumePassages(sampleResumeData as ResumeData)

describe('writingReviewMaterial', () => {
  it('sends every passage for a whole review and keeps them as the context', () => {
    const material = writingReviewMaterial(passages)!
    expect(JSON.parse(material.input).passages).toHaveLength(passages.length)
    expect(JSON.parse(material.context)).toEqual({ passages })
  })

  it('sends one section, with what to avoid, when focused', () => {
    const sent = JSON.parse(writingReviewMaterial(passages, { section: 'experience', avoid: ['Old'] })!.input)
    expect(sent.passages.length).toBeGreaterThan(0)
    expect(sent.passages.every((p: { location: string }) => p.location.startsWith('Experience'))).toBe(true)
    expect(sent.focusSection).toBe('experience')
    expect(sent.avoid).toEqual(['Old'])
  })

  it('is nothing to send for a section without passages', () => {
    expect(writingReviewMaterial(passages, { section: 'no-such-section' })).toBeNull()
  })
})
