// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { AI_PROVIDER_IDS } from '../../generated/choices'
import type { settings } from '../../lib/backend'
import { initialProvider, PROVIDER_GROUPS } from './providerGroups'

const tasks = (providers: Record<string, string>) =>
  ({ aiFeatures: Object.fromEntries(Object.entries({ interviewGrading: 'gemini-live', ...providers }).map(([task, provider]) => [task, { provider }])) }) as unknown as settings.Settings

describe('PROVIDER_GROUPS', () => {
  it('puts every backend provider in exactly one group', () => {
    const grouped = PROVIDER_GROUPS.flatMap((g) => g.providerIds)
    expect([...grouped].sort()).toEqual([...AI_PROVIDER_IDS].sort())
  })

  it('orders the groups remote, harnesses, then this computer', () => {
    expect(PROVIDER_GROUPS.map((g) => g.id)).toEqual(['remote', 'harness', 'local'])
    expect(PROVIDER_GROUPS[0].providerIds[0]).toBe('gemini-live')
    expect(PROVIDER_GROUPS[1].providerIds).toContain('claude-code')
    expect(PROVIDER_GROUPS[0].providerIds).toContain('openai-compatible')
  })
})

describe('initialProvider', () => {
  const [remote, harness, local] = PROVIDER_GROUPS

  it('opens on the first provider in the group (in dropdown order) that a task uses', () => {
    const s = tasks({ interviewGrading: 'deepseek', interviewTips: 'claude-code', interviewPlan: 'lmstudio', jobMatch: 'anthropic' })
    expect(initialProvider(remote, s)).toBe('anthropic') // before deepseek in the dropdown
    expect(initialProvider(local, s)).toBe('lmstudio')
  })

  it("opens on the group's first provider when no task uses it", () => {
    expect(initialProvider(local, tasks({}))).toBe(local.providerIds[0])
    expect(initialProvider(harness, tasks({}))).toBe('claude-code')
  })
})
