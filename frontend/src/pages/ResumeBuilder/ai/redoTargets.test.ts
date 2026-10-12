// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { ai, settings } from '../../../lib/backend'
import { redoTargets } from './redoTargets'

const providers = [
  { id: 'anthropic', label: 'Anthropic API', unavailable: '' },
  { id: 'deepseek', label: 'DeepSeek', unavailable: 'Add your DeepSeek API key' },
  { id: 'ollama', label: 'Ollama', unavailable: '' },
] as ai.AIProvider[]

const s = {
  anthropicModel: 'claude-opus-5-5',
  ollamaModel: '',
  deepseekModel: 'deepseek-chat',
  aiFeatures: {
    resumeTailor: { provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'high' },
    jobMatch: { provider: 'deepseek', model: 'deepseek-reasoner', effort: 'high' },
    resumeImprove: { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'low' },
  },
} as unknown as settings.Settings

describe('redoTargets', () => {
  it('offers ready providers on their own model, then other models tasks already use, once each', () => {
    expect(redoTargets(providers, s)).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', label: 'Anthropic API · claude-opus-5-5' },
      { provider: 'ollama', model: '', label: 'Ollama' },
      { provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Anthropic API · claude-sonnet-5-5' },
    ])
  })
})
