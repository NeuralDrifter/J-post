// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { beforeAll, describe, expect, it } from 'vitest'
import { loadIconDrawings, searchIcons, type IconDrawings } from './icons'

let drawings: IconDrawings
beforeAll(async () => {
  drawings = await loadIconDrawings()
})

describe('icons', () => {
  it('finds icons by name, those starting with the search first', () => {
    const found = searchIcons(drawings, 'pin', 40)
    expect(found[0]?.startsWith('pin')).toBe(true)
    expect(found.indexOf('pinwheel')).toBeLessThan(found.indexOf('map-pin'))
  })

  it('reads spaces as dashes', () => {
    expect(searchIcons(drawings, 'map pin', 5)).toContain('map-pin')
  })

  it('caps the list and never offers a blank icon', () => {
    const all = searchIcons(drawings, '', 50)
    expect(all).toHaveLength(50)
    expect(all).not.toContain('')
  })

  it('offers only icons the PDF can draw', () => {
    expect(searchIcons(drawings, '', 5000).every((name) => typeof drawings[name] === 'string')).toBe(true)
    expect(searchIcons(drawings, 'caduceus', 5)).toEqual([])
  })
})
