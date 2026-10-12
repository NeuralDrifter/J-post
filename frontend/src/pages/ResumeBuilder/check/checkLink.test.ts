// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { checkLinkTarget } from './checkLink'

const issues = [
  { key: 'A:/basics', category: 'contact' as const },
  { key: 'B:/sections/experience', category: 'dates' as const },
]

describe('checkLinkTarget', () => {
  it('opens Job match', () => {
    expect(checkLinkTarget('match', issues)).toEqual({ tab: 'match', issueKey: null })
  })

  it('picks the first issue of the category', () => {
    expect(checkLinkTarget('dates', issues)).toEqual({ tab: 'issues', issueKey: 'B:/sections/experience' })
  })

  it('opens Issues with nothing picked when the category has none', () => {
    expect(checkLinkTarget('layout', issues)).toEqual({ tab: 'issues', issueKey: null })
  })
})
