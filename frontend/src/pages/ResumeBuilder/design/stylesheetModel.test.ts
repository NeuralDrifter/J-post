// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { SEMANTIC_CSS_LIMITS_V1 } from '@reactive-resume/resume/stylesheet'
import { newResumeData } from '../../../lib/resumes/document'
import { compileForEditor, editorMetadata, replaceColor } from './stylesheetModel'

describe('Custom CSS model', () => {
  it('finds the colours a stylesheet sets', () => {
    const text = 'section { color: #2563eb; }'
    const { colorTokens, errors } = compileForEditor(text)
    expect(errors).toEqual([])
    expect(colorTokens.map((t) => text.slice(t.from, t.to))).toEqual(['#2563eb'])
  })

  it('reports errors that keep the stylesheet from applying', () => {
    const tooLong = `section { color: red; }\n/* ${'x'.repeat(SEMANTIC_CSS_LIMITS_V1.maxSourceBytes)} */`
    expect(compileForEditor(tooLong).errors.length).toBeGreaterThan(0)
    expect(compileForEditor('   ').errors).toEqual([])
  })

  it('replaces one colour where it is written', () => {
    const text = 'header { color: #000000; } section { color: #000000; }'
    const [first] = compileForEditor(text).colorTokens
    expect(replaceColor(text, first!, '#ffffff')).toBe('header { color: #ffffff; } section { color: #000000; }')
  })

  it('names the sections and entries a rule can aim at', () => {
    const { targets, templateParts } = editorMetadata(newResumeData('sample', 'onyx'))
    expect(targets?.some((t) => t.selector === 'header')).toBe(true)
    expect(targets?.some((t) => t.label.startsWith('Experience'))).toBe(true)
    expect(templateParts.length).toBeGreaterThan(0)
  })
})
