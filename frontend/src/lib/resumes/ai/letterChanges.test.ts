// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import type { app } from '../../backend'
import { newLetterData, type LetterData } from '../letter'
import { bodyHtml, compileLetterGeneration, letterDraftAgain, letterDraftMaterial, letterPassages } from './letterChanges'

const empty = { ...newLetterData(null), content: '' } as LetterData
const written = { ...empty, content: '<p>I would like the analyst role.</p><p>Thank you.</p>' } as LetterData
const gen = (edits: unknown[], context = '{}') => ({ id: 'g1', edits: JSON.stringify({ edits }), decisions: '{}', context }) as app.AIGeneration

describe('bodyHtml', () => {
  it('makes a paragraph of each blank-line-separated block, escaped', () => {
    expect(bodyHtml('Dear team,\nI am glad.\n\nR&D <rocks>')).toBe('<p>Dear team, I am glad.</p><p>R&amp;D &lt;rocks&gt;</p>')
  })
})

describe('compileLetterGeneration', () => {
  it('fills an empty body with a draft', () => {
    const { changes } = compileLetterGeneration(empty, gen([{ kind: 'setBody', text: 'First.\n\nSecond.', why: 'a draft' }]))
    expect(changes[0].status).toBe('pending')
    expect(produce(empty, (d) => void changes[0].apply(d)).content).toBe('<p>First.</p><p>Second.</p>')
  })

  it('shows a draft as stale once the body has text', () => {
    const { changes } = compileLetterGeneration(written, gen([{ kind: 'setBody', text: 'First.', why: 'a draft' }]))
    expect(changes[0].status).toBe('stale')
  })

  it('rewrites a paragraph it was sent', () => {
    const passages = letterPassages(written)
    const { changes } = compileLetterGeneration(written, gen([{ kind: 'rewrite', passageId: passages[0].id, text: 'The analyst role fits my work.', why: 'sharper', addsFacts: false }], JSON.stringify({ passages })))
    expect(produce(written, (d) => void changes[0].apply(d)).content).toBe('<p>The analyst role fits my work.</p><p>Thank you.</p>')
  })
})

describe('letterDraftMaterial', () => {
  it('sends no passages for an empty body, and the way to write', () => {
    const sent = JSON.parse(letterDraftMaterial(empty, { tone: 'warm', words: { min: 120, max: 180 } }).input)
    expect(sent).toEqual({ passages: [], tone: 'warm', words: { min: 120, max: 180 }, request: '', avoid: [] })
  })

  it('asks again as it was asked', () => {
    const first = letterDraftMaterial(written, { tone: 'formal', words: { min: 180, max: 320 }, request: 'shorter' })
    const again = JSON.parse(letterDraftAgain(written, first.context, ['Old']).input)
    expect(again).toMatchObject({ tone: 'formal', request: 'shorter', avoid: ['Old'] })
    expect(again.passages).toHaveLength(2)
  })
})
