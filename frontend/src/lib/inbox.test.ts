// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app } from './backend'
import { visiblePostings } from './inbox'

const p = (id: string, state: string) => ({ id, state }) as app.Posting

describe('visiblePostings', () => {
  const list = [p('a', 'new'), p('b', 'seen'), p('c', 'new'), p('d', 'seen')]

  it('shows everything when Only new is off', () => {
    expect(visiblePostings(list, false, new Set()).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('shows new postings when Only new is on', () => {
    expect(visiblePostings(list, true, new Set()).map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('keeps postings opened under Only new, so clicking one does not make it vanish', () => {
    expect(visiblePostings(list, true, new Set(['b'])).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})
