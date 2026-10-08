// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { nextIndex, positionMenu, type MenuEntry } from './menu'

describe('positionMenu', () => {
  const vw = 1000
  const vh = 800
  it('opens at the cursor when there is room', () => {
    expect(positionMenu(100, 100, 200, 300, vw, vh)).toEqual({ left: 100, top: 100 })
  })
  it('flips left and up near the right and bottom edges', () => {
    expect(positionMenu(950, 700, 200, 300, vw, vh)).toEqual({ left: 750, top: 400 })
  })
  it('never goes off the top-left even when the menu is bigger than the space', () => {
    expect(positionMenu(50, 50, 200, 900, vw, vh)).toEqual({ left: 50, top: 4 })
  })
})

describe('nextIndex', () => {
  const items: MenuEntry[] = [
    { label: 'Open' },
    'separator',
    { label: 'Disabled', disabled: true },
    { label: 'Delete' },
  ]
  it('skips separators and disabled items, wrapping around', () => {
    expect(nextIndex(items, -1, 1)).toBe(0)
    expect(nextIndex(items, 0, 1)).toBe(3)
    expect(nextIndex(items, 3, 1)).toBe(0)
    expect(nextIndex(items, 0, -1)).toBe(3)
  })
  it('returns -1 when nothing is selectable', () => {
    expect(nextIndex(['separator', { label: 'x', disabled: true }], -1, 1)).toBe(-1)
  })
})
