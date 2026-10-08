// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { ListJobSources, type main } from './backend'
import { useStaticData } from './staticData'

// Job boards come from the backend registry (sources.go). Their labels never
// change while the app runs; readiness can change in Settings, so the Discover
// page loads its own fresh list instead of using this one.

const MANUAL_SOURCE = { id: 'manual', label: 'Manual' }
const NO_SOURCES: main.JobSource[] = []

export function useJobSources(): main.JobSource[] {
  return useStaticData('jobSources', ListJobSources) ?? NO_SOURCES
}

export function sourceLabel(sources: main.JobSource[], id: string): string {
  if (id === MANUAL_SOURCE.id) return MANUAL_SOURCE.label
  return sources.find((s) => s.id === id)?.label ?? id
}

/** Every source a job can come from, for filters: the boards plus "Manual". */
export function sourceOptions(sources: main.JobSource[]): { id: string; label: string }[] {
  return [...sources.map(({ id, label }) => ({ id, label })), MANUAL_SOURCE]
}

export function defaultSourceIds(sources: main.JobSource[]): string[] {
  return sources.filter((s) => s.defaultOn).map((s) => s.id)
}
