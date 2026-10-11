// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { matchesTemplateFilter, TEMPLATES, templateTags } from './templates'

describe('template gallery', () => {
  it('filters by columns and ATS safety', () => {
    expect(matchesTemplateFilter('azurill', 'two')).toBe(true)
    expect(matchesTemplateFilter('azurill', 'one')).toBe(false)
    expect(matchesTemplateFilter('kakuna', 'one')).toBe(true)
    expect(TEMPLATES.filter((t) => matchesTemplateFilter(t, 'all'))).toHaveLength(TEMPLATES.length)
  })

  it('shows only ATS-safe templates under ATS-safe', () => {
    const safe = TEMPLATES.filter((t) => matchesTemplateFilter(t, 'ats'))
    expect(safe.length).toBeGreaterThan(0)
    expect(safe.every((t) => templateTags(t).includes('ATS-safe'))).toBe(true)
  })

  it('tags a template by its layout', () => {
    expect(templateTags('azurill')).toBe('Two columns')
    expect(templateTags('kakuna')).toMatch(/^One column/)
  })
})
