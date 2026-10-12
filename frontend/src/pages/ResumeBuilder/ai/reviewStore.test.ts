// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app } from '../../../lib/backend'
import { anyAccepted, mergeDecisions } from './reviewStore'

describe('mergeDecisions', () => {
  it('records new decisions and clears the ones taken back', () => {
    expect(mergeDecisions({ 'g:0': 'rejected', 'g:1': 'accepted' }, { 'g:0': null, 'g:2': 'rejected' })).toEqual({ 'g:1': 'accepted', 'g:2': 'rejected' })
  })
})

describe('anyAccepted', () => {
  it('is true once something from the run was accepted', () => {
    expect(anyAccepted({ decisions: '{"g:0":"rejected"}' } as app.AIGeneration)).toBe(false)
    expect(anyAccepted({ decisions: '{"g:0":"accepted"}' } as app.AIGeneration)).toBe(true)
  })
})
