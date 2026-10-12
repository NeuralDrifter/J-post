// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { sampleResumeData } from '@reactive-resume/schema/resume/sample'
import type { ResumeData } from '../document'
import { importTidyMaterial } from './importTidy'

const data = sampleResumeData as ResumeData

describe('importTidyMaterial', () => {
  it('sends the text and every built-in section with a blank entry showing its fields', () => {
    const sent = JSON.parse(importTidyMaterial(data, 'Ada Lovelace\nAnalyst').input)
    expect(sent.text).toBe('Ada Lovelace\nAnalyst')
    const experience = sent.sections.find((s: { id: string }) => s.id === 'experience')
    expect(experience.items).toHaveLength(data.sections.experience.items.length)
    expect(experience.blank).toHaveProperty('company')
    expect(experience.blank).not.toHaveProperty('id')
  })
})
