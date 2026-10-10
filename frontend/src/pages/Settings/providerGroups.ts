// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { AI_PROVIDER_IDS } from '../../generated/choices'
import type { settings } from '../../lib/backend'

export type ProviderId = (typeof AI_PROVIDER_IDS)[number]

export type ProviderGroup = {
  id: 'remote' | 'harness' | 'local'
  title: string
  hint: string
  providerIds: readonly ProviderId[] // in dropdown order
}

/** How Settings → AI providers groups the providers' setup; each has its own dropdown. */
export const PROVIDER_GROUPS: readonly ProviderGroup[] = [
  {
    id: 'remote',
    title: 'Remote APIs',
    hint: 'Services reached over the internet with your own key.',
    providerIds: ['gemini-live', 'anthropic', 'openai', 'deepseek', 'openai-compatible'],
  },
  {
    id: 'harness',
    title: 'Harnesses',
    hint: 'AI agent programs installed on this computer that run on your own subscription.',
    providerIds: ['claude-code'],
  },
  {
    id: 'local',
    title: 'On this computer',
    hint: 'Models running on your own PC: free, and nothing leaves it.',
    providerIds: ['ollama', 'lmstudio'],
  },
]

/** The provider a group's dropdown opens on: the first one a task uses, else the group's first. */
export function initialProvider(group: ProviderGroup, s: settings.Settings): ProviderId {
  const inUse: string[] = [s.gradingProvider, s.tipsProvider, s.planProvider, s.matchProvider]
  return group.providerIds.find((id) => inUse.includes(id)) ?? group.providerIds[0]
}
