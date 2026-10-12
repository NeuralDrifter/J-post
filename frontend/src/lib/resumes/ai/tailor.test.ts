// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { sampleResumeData } from '@reactive-resume/schema/resume/sample'
import type { ResumeData } from '../document'
import { resumePassages } from './resumeChanges'
import { coverageOf, parseTailorTerms, tailorMaterial, termCoverage } from './tailor'

const data = sampleResumeData as ResumeData
const passages = resumePassages(data)
const terms = { found: ['C++'], missing: ['Kubernetes'] }

describe('tailorMaterial', () => {
  it('sends every passage, the headline, skills, entries and terms for a whole-resume run', () => {
    const { input, context } = tailorMaterial(data, passages, terms)
    const sent = JSON.parse(input)
    expect(sent.passages).toHaveLength(passages.length)
    expect(sent.passages[0]).toEqual({ id: passages[0].id, location: passages[0].location, text: passages[0].text })
    expect(sent.headline).toBe(data.basics.headline)
    expect(sent.skills[0]).toEqual({ id: data.sections.skills.items[0].id, name: data.sections.skills.items[0].name, keywords: data.sections.skills.items[0].keywords })
    expect(sent.entries.some((e: { sectionId: string }) => e.sectionId === 'experience')).toBe(true)
    expect(sent).not.toHaveProperty('focusSection')
    expect(JSON.parse(context)).toEqual({ passages, terms })
  })

  it('sends one section only when focused, with what to avoid', () => {
    const { input, context } = tailorMaterial(data, passages, terms, { section: 'experience', avoid: ['Old idea'] })
    const sent = JSON.parse(input)
    expect(sent.passages.every((p: { location: string }) => p.location.startsWith('Experience'))).toBe(true)
    expect(sent).not.toHaveProperty('headline')
    expect(sent).not.toHaveProperty('skills')
    expect(sent.entries.every((e: { sectionId: string }) => e.sectionId === 'experience')).toBe(true)
    expect(sent.focusSection).toBe('experience')
    expect(sent.avoid).toEqual(['Old idea'])
    expect(parseTailorTerms(context)).toEqual(terms)
  })
})

describe('termCoverage', () => {
  it('is the share of terms used', () => {
    expect(termCoverage(3, 4)).toBe(75)
    expect(termCoverage(0, 0)).toBe(0)
  })
})

describe('coverageOf', () => {
  it('is the share of the run’s terms the resume used', () => {
    expect(coverageOf({ found: ['a'], missing: ['b', 'c', 'd'] })).toBe(25)
  })
})
