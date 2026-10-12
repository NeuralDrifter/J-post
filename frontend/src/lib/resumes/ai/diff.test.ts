// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { hasPlaceholder, splitPlaceholders, wordDiff } from './diff'

describe('wordDiff', () => {
  it('marks removed and added words, keeping the rest', () => {
    expect(wordDiff('Led a team of five', 'Managed a team of 5 engineers')).toEqual([
      { kind: 'removed', text: 'Led' },
      { kind: 'added', text: 'Managed' },
      { kind: 'same', text: ' a team of ' },
      { kind: 'removed', text: 'five' },
      { kind: 'added', text: '5 engineers' },
    ])
  })

  it('treats new text as one addition', () => {
    expect(wordDiff('', 'Cut costs by [x]%')).toEqual([{ kind: 'added', text: 'Cut costs by [x]%' }])
  })
})

describe('placeholders', () => {
  it('finds figures left to fill in', () => {
    expect(splitPlaceholders('Cut costs by [x]% in [year].')).toEqual([
      { text: 'Cut costs by ', placeholder: false },
      { text: '[x]', placeholder: true },
      { text: '% in ', placeholder: false },
      { text: '[year]', placeholder: true },
      { text: '.', placeholder: false },
    ])
    expect(hasPlaceholder('Cut costs by 20%')).toBe(false)
  })
})
