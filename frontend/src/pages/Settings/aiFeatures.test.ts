// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { AI_TASKS } from '../../generated/choices'
import type { ai, settings } from '../../lib/backend'
import { changeTaskProvider, groupSummary, providerModel, setGroupProvider } from './aiFeatures'

const providers = [
  { id: 'gemini-live', label: 'Gemini Live', unavailable: '' },
  { id: 'anthropic', label: 'Anthropic API', unavailable: '' },
  { id: 'deepseek', label: 'DeepSeek', unavailable: 'Add your DeepSeek API key' },
] as ai.AIProvider[]

function withFeatures(overrides: Record<string, Partial<settings.AIChoice>> = {}): settings.Settings {
  const aiFeatures: Record<string, settings.AIChoice> = {}
  for (const t of AI_TASKS) aiFeatures[t.id] = { provider: 'gemini-live', model: '', effort: 'high', ...overrides[t.id] } as settings.AIChoice
  return { aiFeatures, anthropicModel: 'claude-opus-5-5' } as unknown as settings.Settings
}

describe('groupSummary', () => {
  it('lists each provider once, in task order, with any model override', () => {
    const s = withFeatures({ resumeImprove: { provider: 'anthropic', model: 'claude-sonnet-5-5' } })
    expect(groupSummary(s, 'resumes', providers)).toEqual({ count: 4, providers: 'Gemini Live, Anthropic API (claude-sonnet-5-5)', problems: [] })
  })

  it('names the tasks whose provider is not set up', () => {
    const s = withFeatures({ resumeReview: { provider: 'deepseek' } })
    expect(groupSummary(s, 'resumes', providers).problems).toEqual(['Writing review'])
  })
})

describe('setGroupProvider', () => {
  it('moves only that group, and clears model overrides', () => {
    const s = withFeatures({ resumeTailor: { model: 'gemini-x' }, jobMatch: { provider: 'deepseek' } })
    const next = setGroupProvider(s, 'resumes', 'anthropic')
    expect(next.aiFeatures.resumeTailor).toMatchObject({ provider: 'anthropic', model: '', effort: 'high' })
    expect(next.aiFeatures.resumeImport.provider).toBe('anthropic')
    expect(next.aiFeatures.jobMatch.provider).toBe('deepseek')
    expect(s.aiFeatures.resumeTailor.provider).toBe('gemini-live')
  })
})

describe('changeTaskProvider', () => {
  it("drops the old provider's model and keeps the effort", () => {
    const s = withFeatures({ letterDraft: { provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'max' } })
    expect(changeTaskProvider(s, 'letterDraft', 'gemini-live').aiFeatures.letterDraft).toEqual({ provider: 'gemini-live', model: '', effort: 'max' })
  })
})

describe('providerModel', () => {
  it("is the provider's model from AI providers", () => {
    expect(providerModel(withFeatures(), 'anthropic')).toBe('claude-opus-5-5')
    expect(providerModel(withFeatures(), 'nope')).toBe('')
  })
})
