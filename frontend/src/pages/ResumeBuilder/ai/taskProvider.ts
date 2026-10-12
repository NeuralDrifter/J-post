// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { api } from '../../../lib/api'
import { GetSettings, ListAIProviders } from '../../../lib/backend'
import { useLoad } from '../../../lib/useLoad'

/** Who runs a task, as the "what is sent" notes name it: "Anthropic API", or the provider id until it loads. */
export function useTaskProvider(task: string): { label: string; unavailable: string } {
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const id = settings?.aiFeatures[task]?.provider ?? ''
  const provider = providers?.find((p) => p.id === id)
  return { label: provider?.label ?? (id || 'the AI provider'), unavailable: provider?.unavailable ?? '' }
}
