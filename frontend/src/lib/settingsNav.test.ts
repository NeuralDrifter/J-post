// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { hasUnsavedChanges, SETTINGS_SECTIONS, sectionFromParam, settingsLink } from './settingsNav'

describe('settings sections', () => {
  it('lists the menu in order, with job matching separate from AI providers and features', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual(['profile', 'ai', 'features', 'matching', 'search', 'pipeline', 'compensation', 'data'])
  })
  it('reads the section from the URL, defaulting to the profile', () => {
    expect(sectionFromParam('matching')).toBe('matching')
    expect(sectionFromParam(null)).toBe('profile')
    expect(sectionFromParam('nope')).toBe('profile')
  })
  it('links straight to a section', () => {
    expect(settingsLink('matching')).toBe('/settings?section=matching')
  })
})

describe('hasUnsavedChanges', () => {
  const saved = { matchEnabled: false, matchProvider: 'gemini-live', matchWorkModes: ['remote'] }
  it('is false for the same values', () => {
    expect(hasUnsavedChanges(saved, { ...saved, matchWorkModes: ['remote'] })).toBe(false)
  })
  it('is true when any value differs', () => {
    expect(hasUnsavedChanges(saved, { ...saved, matchEnabled: true })).toBe(true)
    expect(hasUnsavedChanges(saved, { ...saved, matchWorkModes: [] })).toBe(true)
  })
})
