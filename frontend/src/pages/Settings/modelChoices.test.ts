import { describe, expect, it } from 'vitest'
import { formatTestResult, modelChoices } from './modelChoices'

describe('modelChoices', () => {
  it('lists the loaded models', () => {
    expect(modelChoices(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('keeps the current model even when the server no longer lists it', () => {
    expect(modelChoices(['a', 'b'], 'old')).toEqual(['old', 'a', 'b'])
  })

  it('adds nothing for an empty current model', () => {
    expect(modelChoices(['a'], '')).toEqual(['a'])
  })
})

describe('formatTestResult', () => {
  it('names the provider, the time in seconds and the model', () => {
    expect(formatTestResult('DeepSeek', { model: 'deepseek-chat', millis: 1234 })).toBe('DeepSeek answered in 1.2 s (deepseek-chat)')
  })

  it('leaves the model out when the provider reported none', () => {
    expect(formatTestResult('Ollama (local)', { model: '', millis: 800 })).toBe('Ollama (local) answered in 0.8 s')
  })
})
