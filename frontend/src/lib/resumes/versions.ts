// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// How a document's history names its versions, as Reactive Resume words them.

const TITLES: Record<string, string> = {
  created: 'Created',
  auto: 'Editing session',
  'before-restore': 'Before restore',
  restored: 'Restored a version',
  'before-ai': 'Before AI edit',
}

/** A version's title: its name for a named version, else what made it. */
export function versionTitle(version: { kind: string; name: string }): string {
  if (version.kind === 'named') return version.name || 'Named version'
  if (version.kind === 'ai') return version.name || 'AI edit'
  return TITLES[version.kind] ?? 'Version'
}

/** How the version came about, shown beside when. */
export function versionDetail(kind: string): string {
  if (kind === 'named') return 'named'
  if (kind === 'ai' || kind === 'before-ai') return 'AI'
  return kind === 'auto' || kind === 'before-restore' ? 'autosaved' : 'saved'
}

/** Only named versions are the author's to rename or delete; the rest expire on their own. */
export const isNamedVersion = (version: { kind: string }) => version.kind === 'named'

/** One id per visit to an editor: its saves refresh one autosave in the history. */
export const newEditingSession = (): string => crypto.randomUUID()
