// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { RefreshCw } from 'lucide-react'
import { api } from '../../../lib/api'
import { GetSettings, ListAIProviders, type ai, type settings } from '../../../lib/backend'
import type { MenuItem } from '../../../lib/menu'
import { useLoad } from '../../../lib/useLoad'
import { providerModel } from '../../Settings/aiFeatures'

/** A provider and model to run something again with, once, without changing Settings. */
export type RedoTarget = { provider: string; model: string; label: string }

/**
 * Every ready provider on its own model, plus any other model a task in Settings already uses with it: the
 * choices "Redo with" offers.
 */
export function redoTargets(providers: readonly ai.AIProvider[], s: settings.Settings): RedoTarget[] {
  const ready = providers.filter((p) => !p.unavailable)
  const pairs = [
    ...ready.map((p) => ({ provider: p.id, model: providerModel(s, p.id) })),
    ...Object.values(s.aiFeatures).filter((c) => c.model && ready.some((p) => p.id === c.provider)),
  ]
  const seen = new Set<string>()
  return pairs.flatMap(({ provider, model }) => {
    const key = `${provider}|${model}`
    if (seen.has(key)) return []
    seen.add(key)
    const label = ready.find((p) => p.id === provider)?.label ?? provider
    return [{ provider, model, label: model ? `${label} · ${model}` : label }]
  })
}

export function useRedoTargets(): RedoTarget[] {
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const { data: s } = useLoad(() => api(GetSettings()), [])
  return providers && s ? redoTargets(providers, s) : []
}

/** "Redo with ▸" as a menu item, its submenu the targets. */
export function redoMenuItem(targets: readonly RedoTarget[], onPick: (target: RedoTarget) => void): MenuItem {
  return {
    label: 'Redo with',
    icon: RefreshCw,
    disabled: targets.length === 0,
    submenu: targets.map((t) => ({ label: t.label, onSelect: () => onPick(t) })),
  }
}
