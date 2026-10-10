// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { t } from './linguiMacro'

describe('t', () => {
  it('reads a message as written, with its values in place', () => {
    const count = 3
    expect(t`Fix these ${count} errors.`).toBe('Fix these 3 errors.')
    expect(t`No text could be read from this file.`).toBe('No text could be read from this file.')
  })
})
