// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { fontWeights, previewFamily, searchFonts, toggleWeight } from './fonts'

describe('font picker data', () => {
  it('finds families by name, the exact name first', () => {
    const found = searchFonts('roboto', 50).map((f) => f.family)
    expect(found[0]).toBe('Roboto')
    expect(found.every((f) => f.toLowerCase().includes('roboto'))).toBe(true)
  })

  it('lists names that start with the search before names that only contain it', () => {
    const found = searchFonts('pla', 80).map((f) => f.family)
    const firstContaining = found.findIndex((f) => !/(^|\s)pla/i.test(f))
    const lastStarting = found.findLastIndex((f) => f.toLowerCase().startsWith('pla'))
    expect(lastStarting).toBeLessThan(firstContaining)
  })

  it('caps the results', () => {
    expect(searchFonts('', 25)).toHaveLength(25)
  })

  it('lists weights lightest first', () => {
    const weights = fontWeights('Roboto')
    expect(weights).toEqual([...weights].sort((a, b) => Number(a) - Number(b)))
    expect(weights).toContain('400')
  })

  it('toggles weights but keeps at least one', () => {
    expect(toggleWeight(['400'], '700')).toEqual(['400', '700'])
    expect(toggleWeight(['400', '700'], '400')).toEqual(['700'])
    expect(toggleWeight(['400'], '400')).toEqual(['400'])
  })

  it('previews web fonts under their own name', () => {
    expect(previewFamily('Roboto')).toBe('Roboto Preview')
  })
})
