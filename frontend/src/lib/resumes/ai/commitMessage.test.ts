// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { commitMessage } from './commitMessage'

describe('commitMessage', () => {
  it('says what changed, for which job, by which model', () => {
    expect(commitMessage({ task: 'resumeTailor', sections: ['Summary', 'Experience', 'Summary'], job: 'Senior Engineer at Acme', model: 'claude-opus-5-5' })).toBe(
      'Tailored Summary, Experience · Senior Engineer at Acme · claude-opus-5-5',
    )
  })

  it('reads without a job or sections', () => {
    expect(commitMessage({ task: 'letterDraft', sections: [], model: 'gemini-3.8-live' })).toBe('Drafted the document · gemini-3.8-live')
  })
})
