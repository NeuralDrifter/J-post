// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { zoomIn, zoomLabel, zoomOut } from './zoom'

describe('zoom', () => {
  it('steps in and out from Fit as if it were 100%', () => {
    expect(zoomIn('fit')).toBe(1.25)
    expect(zoomOut('fit')).toBe(0.75)
  })

  it('stops at the smallest and largest steps', () => {
    expect(zoomOut(0.5)).toBe(0.5)
    expect(zoomIn(2)).toBe(2)
  })

  it('labels Fit and percentages', () => {
    expect(zoomLabel('fit')).toBe('Fit')
    expect(zoomLabel(1.25)).toBe('125%')
  })
})
