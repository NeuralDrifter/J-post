// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { libraryOrder, templateLabel, templateOf, type LibraryDocument } from './library'

const doc = (id: string, name: string, data = '{}'): LibraryDocument => ({ id, kind: 'resume', name, data, updatedAt: '2026-10-01T12:00:00Z' })

describe('libraryOrder', () => {
  const docs = [doc('a', 'Backend'), doc('b', 'Frontend'), doc('c', 'Data platform')]

  it('puts the default resume first and keeps the rest in their order', () => {
    expect(libraryOrder(docs, 'c', '').map((d) => d.id)).toEqual(['c', 'a', 'b'])
  })

  it('filters by name, ignoring case and surrounding spaces', () => {
    expect(libraryOrder(docs, '', '  END ').map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('keeps the order when there is no default', () => {
    expect(libraryOrder(docs, '', '').map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('templateOf', () => {
  it("reads the template from the document's data", () => {
    expect(templateOf(doc('a', 'A', JSON.stringify({ metadata: { template: 'lapras' } })))).toBe('lapras')
  })

  it("reads a letter's template from its style", () => {
    expect(templateOf(doc('a', 'A', JSON.stringify({ style: { metadata: { template: 'onyx' } } })))).toBe('onyx')
  })

  it('is unknown for data it cannot read', () => {
    expect(templateOf(doc('a', 'A', '{broken'))).toBe('')
    expect(templateOf(doc('a', 'A', '{"metadata":{}}'))).toBe('')
  })
})

describe('templateLabel', () => {
  it('capitalises the template id', () => {
    expect(templateLabel('chikorita')).toBe('Chikorita')
    expect(templateLabel('')).toBe('')
  })
})
