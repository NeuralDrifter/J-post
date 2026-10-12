// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The Settings page's side menu: one section shows at a time, picked by
// ?section= in the URL so other pages can link straight to one.

export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile & resume' },
  { id: 'ai', label: 'AI providers' },
  { id: 'features', label: 'AI features' },
  { id: 'matching', label: 'Job matching' },
  { id: 'search', label: 'Job search' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'compensation', label: 'Compensation' },
  { id: 'data', label: 'Data & about' },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

export function sectionFromParam(value: string | null): SettingsSectionId {
  return SETTINGS_SECTIONS.find((s) => s.id === value)?.id ?? 'profile'
}

export function settingsLink(id: SettingsSectionId): string {
  return `/settings?section=${id}`
}

/** True when the form's values differ from the saved settings. */
export function hasUnsavedChanges(saved: object, current: object): boolean {
  return JSON.stringify(saved) !== JSON.stringify(current)
}
