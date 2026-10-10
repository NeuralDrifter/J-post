// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { newResumeData, parseStoredResume, resumePlainText, serializeResume } from './document'

describe('newResumeData', () => {
  it('starts a blank resume on the chosen template', () => {
    const data = newResumeData('blank', 'lapras')
    expect(data.metadata.template).toBe('lapras')
    expect(data.basics.name).toBe('')
    expect(data.sections.experience.items).toEqual([])
  })

  it('starts from the sample content on the chosen template', () => {
    const data = newResumeData('sample', 'onyx')
    expect(data.metadata.template).toBe('onyx')
    expect(data.basics.name).not.toBe('')
    expect(data.sections.experience.items.length).toBeGreaterThan(0)
  })
})

describe('parseStoredResume', () => {
  it('reads back what serializeResume wrote', () => {
    const data = newResumeData('sample', 'onyx')
    const parsed = parseStoredResume(serializeResume(data))
    expect(parsed).toEqual({ ok: true, data })
  })

  it('reports JSON that is not JSON', () => {
    const parsed = parseStoredResume('{nope')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/not valid JSON/)
  })

  it('reports JSON that is not a resume, naming where it fails', () => {
    const data = newResumeData('sample', 'onyx')
    const parsed = parseStoredResume(JSON.stringify({ ...data, basics: { ...data.basics, name: 1 } }))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/basics/)
  })
})

describe('resumePlainText', () => {
  it('includes the name, headline and work history the AI features read', () => {
    const data = newResumeData('sample', 'onyx')
    const text = resumePlainText(data)
    expect(text).toContain(data.basics.name)
    expect(text).toContain(data.basics.headline)
    expect(text).toContain(data.sections.experience.items[0]!.company)
  })

  it('is empty for a blank resume', () => {
    expect(resumePlainText(newResumeData('blank', 'onyx')).trim()).toBe('')
  })
})
