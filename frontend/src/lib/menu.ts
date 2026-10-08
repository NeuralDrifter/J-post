// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'

// App-wide right-click menus. Components call openMenu(e, items) from onContextMenu;
// a single <ContextMenuHost /> renders whatever is open.

export type MenuItem = {
  label: string
  icon?: LucideIcon
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
  submenu?: MenuEntry[]
}
export type MenuEntry = MenuItem | 'separator'

export type OpenMenu = { x: number; y: number; items: MenuEntry[] }

let current: OpenMenu | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Opens a menu at the cursor and stops the browser's own menu (and any outer menu). */
export function openMenu(e: ReactMouseEvent | MouseEvent, items: MenuEntry[]): void {
  e.preventDefault()
  e.stopPropagation()
  current = { x: e.clientX, y: e.clientY, items }
  emit()
}

export function closeMenu(): void {
  if (!current) return
  current = null
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useOpenMenu(): OpenMenu | null {
  return useSyncExternalStore(subscribe, () => current)
}

/** Places a w×h menu at the cursor, flipping left/up so it stays inside the viewport. */
export function positionMenu(x: number, y: number, w: number, h: number, vw: number, vh: number, margin = 4) {
  let left = x + w > vw - margin ? x - w : x
  let top = y + h > vh - margin ? y - h : y
  left = Math.max(margin, Math.min(left, vw - w - margin))
  top = Math.max(margin, Math.min(top, vh - h - margin))
  if (h > vh - 2 * margin) top = margin
  if (w > vw - 2 * margin) left = margin
  return { left, top }
}

const selectable = (e: MenuEntry): e is MenuItem => e !== 'separator' && !e.disabled

/** Next selectable index in direction dir (1 or -1), wrapping; -1 if none. */
export function nextIndex(items: MenuEntry[], from: number, dir: 1 | -1): number {
  const n = items.length
  for (let step = 1; step <= n; step++) {
    const i = (((from + dir * step) % n) + n) % n
    if (selectable(items[i])) return i
  }
  return -1
}
