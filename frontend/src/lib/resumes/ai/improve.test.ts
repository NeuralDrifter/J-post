// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Passage } from '@reactive-resume/resume/proposals'
import { fieldKeyOf, improveAgain, improveInput, linePassage } from './improve'

const target = { sectionId: 'experience', itemId: 'e1', field: 'description' }
const passage: Passage = { id: 'p_1', target, location: 'Experience · Acme · bullet 1', html: '<li><p>Was in charge of five engineers</p></li>', text: 'Was in charge of five engineers' }
const elsewhere: Passage = { ...passage, id: 'p_2', target: { ...target, itemId: 'e2' } }

describe('linePassage', () => {
  it('finds the line in its own field only', () => {
    expect(linePassage([elsewhere, passage], target, '  Was in charge of   five engineers ')).toBe(passage)
    expect(linePassage([elsewhere], target, 'Was in charge of five engineers')).toBeUndefined()
    expect(linePassage([passage], target, '   ')).toBeUndefined()
  })

  it('keys fields by section, entry, role and field', () => {
    expect(fieldKeyOf(target)).toBe('experience|e1||description')
    expect(fieldKeyOf({ ...target, roleId: 'r1' })).toBe('experience|e1|r1|description')
  })
})

describe('improveInput', () => {
  it('sends the line with its id, the ask, the field and what to avoid', () => {
    const next: Passage = { ...passage, id: 'p_3', text: 'Shipped v2' }
    const input = JSON.parse(improveInput(passage, [passage, elsewhere, next], 'custom', 'more formal', ['Ran five engineers']))
    expect(input).toEqual({
      action: 'custom',
      request: 'more formal',
      where: 'Experience · Acme · bullet 1',
      line: { id: 'p_1', text: 'Was in charge of five engineers' },
      field: 'Was in charge of five engineers\nShipped v2',
      avoid: ['Ran five engineers'],
    })
    expect(JSON.parse(improveInput(passage, [passage], 'verb', 'ignored'))).not.toHaveProperty('request')
  })
})

describe('improveAgain', () => {
  const context = JSON.stringify({ passages: [passage], action: 'shorter', request: '' })

  it('asks the same way about the same line, avoiding what was turned down', () => {
    const again = improveAgain(context, [passage], ['Led five engineers'])
    expect(again?.context).toBe(context)
    expect(JSON.parse(again!.input)).toMatchObject({ action: 'shorter', line: { id: 'p_1' }, avoid: ['Led five engineers'] })
  })

  it('gives up once the line has changed', () => {
    expect(improveAgain(context, [elsewhere], [])).toBeNull()
    expect(improveAgain('not json', [passage], [])).toBeNull()
  })
})
