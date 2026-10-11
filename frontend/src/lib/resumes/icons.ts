// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The icons a resume can show: Reactive Resume's Phosphor set, searched by
// name, and drawn from the same paths the PDF uses.
import { icons } from '@reactive-resume/schema/icons'

const ICON_NAMES = icons.filter((name) => name !== '')

/** The drawing of each icon, by name. */
export type IconDrawings = Record<string, string>

/**
 * Icons whose name matches the search (all when blank), at most `limit`, names that start with it first.
 * Only icons the PDF can draw are offered.
 */
export function searchIcons(drawings: IconDrawings, query: string, limit: number): string[] {
  const drawable = ICON_NAMES.filter((name) => name in drawings)
  const q = query.trim().toLowerCase().replace(/\s+/g, '-')
  if (!q) return drawable.slice(0, limit)
  return drawable
    .map((name) => ({ name, rank: matchRank(name, q) }))
    .filter(({ rank }) => rank < NO_MATCH)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ name }) => name)
}

const NO_MATCH = 4

/** 0 exact, 1 starts with the search, 2 a later word does ("map-pin" for "pin"), 3 anywhere. */
function matchRank(name: string, query: string): number {
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(`-${query}`)) return 2
  return name.includes(query) ? 3 : NO_MATCH
}

let drawings: Promise<IconDrawings> | undefined

/** Each icon's SVG paths (a 256-unit square), loaded once when an icon is first shown. */
export function loadIconDrawings(): Promise<IconDrawings> {
  drawings ??= import('../../vendor/reactive-resume/pdf/forme/phosphor-icons.json').then((module) => module.default as IconDrawings)
  return drawings
}
