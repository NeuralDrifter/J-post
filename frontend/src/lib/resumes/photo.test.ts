// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { fitWithin } from './photo'

describe('photo size', () => {
  it('scales the long side down to the limit, keeping the shape', () => {
    expect(fitWithin(2000, 1000, 512)).toEqual({ width: 512, height: 256 })
    expect(fitWithin(600, 1200, 512)).toEqual({ width: 256, height: 512 })
  })

  it('never enlarges a small photo', () => {
    expect(fitWithin(200, 300, 512)).toEqual({ width: 200, height: 300 })
  })
})
