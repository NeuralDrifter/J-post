// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { createEntry } from '@reactive-resume/web/features/resume/editor/write/model'
import { sectionTypeSchema } from '@reactive-resume/schema/resume/data'
import { FIELD_SETS, fieldKeys } from './fieldSets'

describe('FIELD_SETS', () => {
  it.each(sectionTypeSchema.options)('%s edits only fields its entries have', (type) => {
    const entry = createEntry(type) as Record<string, unknown>
    for (const key of fieldKeys(FIELD_SETS[type])) expect(entry, `${type}.${key}`).toHaveProperty(key)
  })

  it.each(sectionTypeSchema.options)('%s edits every field its entries print', (type) => {
    const entry = createEntry(type) as Record<string, unknown>
    const internal = new Set(['id', 'hidden', 'period', 'date', 'iconColor'])
    const printed = Object.keys(entry).filter((key) => !internal.has(key))
    expect(fieldKeys(FIELD_SETS[type]).sort()).toEqual(printed.sort())
  })
})
