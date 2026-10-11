// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** Kinds of items searchable through the command palette. */
export type CommandKind = 'page' | 'action' | 'job' | 'document' | 'recent'

export type CommandItem = {
  id: string
  kind: CommandKind
  title: string
  subtitle?: string
  keywords?: string[]
  icon?: string
  perform: () => void | Promise<void>
}

/** Scores how well an item matches a search query. Returns > 0 if matched. Higher score ranks earlier. */
export function scoreCommandMatch(title: string, query: string, subtitle?: string, keywords?: string[]): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1

  const t = title.toLowerCase()
  const s = subtitle?.toLowerCase() ?? ''
  const kw = (keywords ?? []).map((k) => k.toLowerCase()).join(' ')

  // 1. Exact title match
  if (t === q) return 1000

  // 2. Title starts with query
  if (t.startsWith(q)) return 500 + Math.max(0, 100 - t.length)

  // 3. Word in title starts with query
  const titleWords = t.split(/[\s—–-]+/)
  if (titleWords.some((w) => w.startsWith(q))) return 300

  // 4. Substring in title
  const titleIdx = t.indexOf(q)
  if (titleIdx !== -1) return 200 - Math.min(100, titleIdx)

  // 5. Word in subtitle starts with query
  const subWords = s.split(/[\s—–-]+/)
  if (subWords.some((w) => w.startsWith(q))) return 150

  // 6. Substring in subtitle
  if (s.includes(q)) return 100

  // 7. Substring in keywords
  if (kw.includes(q)) return 80

  // 8. Fuzzy subsequence in title
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  if (qi === q.length) return 50

  return 0
}

/** Filters and ranks command items by relevance to the query. */
export function filterAndRankCommands<T extends { title: string; subtitle?: string; keywords?: string[] }>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim()
  if (!q) return items

  return items
    .map((item) => ({ item, score: scoreCommandMatch(item.title, q, item.subtitle, item.keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}

/** Checks whether an event target is an editor or input element that handles Ctrl+K itself. */
export function targetUsesCtrlK(target: EventTarget | null): boolean {
  if (!target || typeof (target as unknown as { closest?: unknown }).closest !== 'function') return false
  const el = target as unknown as { closest: (selector: string) => Element | null }
  return Boolean(el.closest('[data-uses-ctrl-k="true"], .ProseMirror, [contenteditable="true"]'))
}

/** Determines whether a keydown event should open the command palette. */
export function shouldOpenCommandPalette(
  event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target: EventTarget | null },
  hasOpenDialog: boolean,
): boolean {
  if (hasOpenDialog) return false
  if (event.altKey) return false
  if (!event.ctrlKey && !event.metaKey) return false
  if (event.key.toLowerCase() !== 'k') return false
  if (targetUsesCtrlK(event.target)) return false
  return true
}

const RECENTS_KEY = 'jobtrack:command-palette-recents'
const MAX_RECENTS = 5

/** Retrieves the list of recently executed command item IDs. */
export function loadRecentCommandIds(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Records an executed command item ID to recents. */
export function recordRecentCommandId(id: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    const existing = loadRecentCommandIds().filter((x) => x !== id)
    const updated = [id, ...existing].slice(0, MAX_RECENTS)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage quota or disabled storage
  }
}
