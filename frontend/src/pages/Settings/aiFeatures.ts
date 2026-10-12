// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Settings → AI features: who runs each AI task, shown one collapsible card per group.

import { AI_TASKS } from '../../generated/choices'
import type { ai, settings } from '../../lib/backend'

export type AITaskId = (typeof AI_TASKS)[number]['id']
export type AITaskGroupId = (typeof AI_TASKS)[number]['group']

/** What a group's collapsed card says: how many tasks, who runs them, and which can't run yet. */
export type GroupSummary = { count: number; providers: string; problems: string[] }

export const tasksIn = (group: string) => AI_TASKS.filter((t) => t.group === group)

/** The model a provider runs when a task doesn't pick one, as set in AI providers ('' when none is set). */
export function providerModel(s: settings.Settings, providerId: string): string {
  const models: Record<string, string> = {
    'gemini-live': s.geminiLiveModel,
    anthropic: s.anthropicModel,
    'claude-code': s.claudeCodeModel,
    openai: s.openaiModel,
    deepseek: s.deepseekModel,
    ollama: s.ollamaModel,
    lmstudio: s.lmStudioModel,
    'openai-compatible': s.customAIModel,
  }
  return models[providerId] ?? ''
}

/** "Claude Opus (claude-sonnet-5-5), Gemini Live": each distinct provider (and model override) in task order. */
export function groupSummary(s: settings.Settings, group: string, providers: readonly ai.AIProvider[]): GroupSummary {
  const tasks = tasksIn(group)
  const labelOf = (id: string) => providers.find((p) => p.id === id)?.label ?? id
  const names = tasks.map((t) => {
    const choice = s.aiFeatures[t.id]
    return choice.model ? `${labelOf(choice.provider)} (${choice.model})` : labelOf(choice.provider)
  })
  const problems = tasks.filter((t) => providers.find((p) => p.id === s.aiFeatures[t.id].provider)?.unavailable).map((t) => t.label)
  return { count: tasks.length, providers: [...new Set(names)].join(', '), problems }
}

export function setTaskChoice(s: settings.Settings, task: string, patch: Partial<settings.AIChoice>): settings.Settings {
  const next = { ...s.aiFeatures[task], ...patch }
  return { ...s, aiFeatures: { ...s.aiFeatures, [task]: next } } as settings.Settings
}

/** Every task in the group on one provider, each on that provider's own model. */
export function setGroupProvider(s: settings.Settings, group: string, provider: string): settings.Settings {
  return tasksIn(group).reduce((acc, t) => setTaskChoice(acc, t.id, { provider, model: '' }), s)
}

/** Picking another provider for a task drops its model, which belonged to the old provider. */
export const changeTaskProvider = (s: settings.Settings, task: string, provider: string) => setTaskChoice(s, task, { provider, model: '' })
