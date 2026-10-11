// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { isNamedVersion, newEditingSession, versionDetail, versionTitle } from './versions'

describe('version labels', () => {
  it('titles a named version by its name', () => {
    expect(versionTitle({ kind: 'named', name: 'Sent to Lumen' })).toBe('Sent to Lumen')
    expect(versionTitle({ kind: 'named', name: '' })).toBe('Named version')
  })

  it('titles other versions by what made them', () => {
    expect(versionTitle({ kind: 'auto', name: '' })).toBe('Editing session')
    expect(versionTitle({ kind: 'before-restore', name: '' })).toBe('Before restore')
    expect(versionTitle({ kind: 'mystery', name: '' })).toBe('Version')
  })

  it('says how a version was saved', () => {
    expect(versionDetail('auto')).toBe('autosaved')
    expect(versionDetail('named')).toBe('named')
    expect(versionDetail('created')).toBe('saved')
  })

  it('lets only named versions be edited', () => {
    expect(isNamedVersion({ kind: 'named' })).toBe(true)
    expect(isNamedVersion({ kind: 'auto' })).toBe(false)
  })

  it('gives each editing visit its own session', () => {
    expect(newEditingSession()).not.toBe(newEditingSession())
  })
})
