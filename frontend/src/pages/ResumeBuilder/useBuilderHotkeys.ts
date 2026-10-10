// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from 'react'

export type BuilderShortcuts = { undo: () => void; redo: () => void; exportPdf: () => void; zoomIn: () => void; zoomOut: () => void }

/** Text fields keep their own undo; the resume's undo applies everywhere else. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
}

/** Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo and redo, Ctrl+S exports, Ctrl+= and Ctrl+- zoom. */
export function useBuilderHotkeys(shortcuts: BuilderShortcuts) {
  const latest = useRef(shortcuts)
  latest.current = shortcuts

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return
      const action = pick(e)
      if (!action) return
      e.preventDefault()
      action()
    }
    const pick = (e: KeyboardEvent): (() => void) | undefined => {
      const key = e.key.toLowerCase()
      const { undo, redo, exportPdf, zoomIn, zoomOut } = latest.current
      if (key === 's') return exportPdf
      if (key === '=' || key === '+') return zoomIn
      if (key === '-') return zoomOut
      if (isTyping(e.target)) return undefined
      if (key === 'z') return e.shiftKey ? redo : undo
      if (key === 'y') return redo
      return undefined
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
