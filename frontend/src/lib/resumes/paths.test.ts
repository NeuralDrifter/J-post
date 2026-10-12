// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { builderCheckPath, CHECK_MATCH } from './paths'

describe('builderCheckPath', () => {
  it('opens Check on an issue category', () => {
    expect(builderCheckPath('r1', 'dates')).toBe('/resumes/r1?check=dates')
  })

  it('opens Job match for a job', () => {
    expect(builderCheckPath('r1', CHECK_MATCH, 'j 1')).toBe('/resumes/r1?check=match&job=j+1')
  })
})
