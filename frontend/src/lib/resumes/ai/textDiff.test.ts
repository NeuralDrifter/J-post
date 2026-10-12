// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { changedBlocks } from './textDiff'

describe('changedBlocks', () => {
  it('pairs a replaced line, and keeps pure additions and removals', () => {
    expect(changedBlocks('Summary\nLed a team\nGo\nRust\n', 'Summary\nManaged a team\nGo\nKubernetes\n')).toEqual([
      { before: 'Led a team', after: 'Managed a team' },
      { before: 'Rust', after: 'Kubernetes' },
    ])
    expect(changedBlocks('A\n', 'A\nB\n')).toEqual([{ before: '', after: 'B' }])
    expect(changedBlocks('A\nB\n', 'A\n')).toEqual([{ before: 'B', after: '' }])
  })

  it('finds nothing when the text is the same', () => {
    expect(changedBlocks('A\nB', 'A\nB')).toEqual([])
  })
})
