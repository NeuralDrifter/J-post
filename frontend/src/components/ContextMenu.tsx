// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ClipboardPaste, Copy, RefreshCw, Plus, Scissors, TextSelect } from 'lucide-react'
import { notifyDataChanged } from '../lib/events'
import { closeMenu, nextIndex, openMenu, positionMenu, useOpenMenu, type MenuEntry, type MenuItem } from '../lib/menu'
import { toast } from '../lib/toast'

/** Asks the top bar to open the New application dialog, optionally with a status. */
export function requestNewApplication(status?: string) {
  window.dispatchEvent(new CustomEvent('jobtrack:new-application', { detail: { status } }))
}

export async function copyText(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(what)
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  if (el instanceof HTMLInputElement) return !el.readOnly && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type)
  return (el as HTMLElement).isContentEditable
}

/** Cut, Copy, Paste and Select all for a text field. */
export function editMenu(el: HTMLElement): MenuEntry[] {
  const hasSelection = (() => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      try {
        return el.selectionStart !== el.selectionEnd
      } catch {
        return false // some input types (number, email) don't expose selection
      }
    }
    return !!window.getSelection()?.toString()
  })()
  // execCommand keeps the field's undo history and fires React's onChange.
  return [
    { label: 'Cut', icon: Scissors, shortcut: 'Ctrl+X', disabled: !hasSelection, onSelect: () => document.execCommand('cut') },
    { label: 'Copy', icon: Copy, shortcut: 'Ctrl+C', disabled: !hasSelection, onSelect: () => document.execCommand('copy') },
    {
      label: 'Paste',
      icon: ClipboardPaste,
      shortcut: 'Ctrl+V',
      onSelect: () => {
        el.focus()
        navigator.clipboard
          .readText()
          .then((text) => document.execCommand('insertText', false, text))
          .catch(() => toast.error('Could not read the clipboard'))
      },
    },
    'separator',
    {
      label: 'Select all',
      icon: TextSelect,
      shortcut: 'Ctrl+A',
      onSelect: () => {
        el.focus()
        document.execCommand('selectAll')
      },
    },
  ]
}

/**
 * Replaces the browser's right-click menu everywhere. Elements with their own
 * onContextMenu handle it first (and stop it); this catches everything else.
 */
function useGlobalContextMenu() {
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      const target = e.target as Element | null
      const field = target?.closest('input, textarea, [contenteditable="true"]') ?? null
      if (isEditable(field)) {
        openMenu(e, editMenu(field as HTMLElement))
        return
      }
      const selected = window.getSelection()?.toString() ?? ''
      if (selected.trim()) {
        openMenu(e, [{ label: 'Copy', icon: Copy, shortcut: 'Ctrl+C', onSelect: () => copyText(selected) }])
        return
      }
      openMenu(e, [
        { label: 'New application', icon: Plus, onSelect: () => requestNewApplication() },
        { label: 'Refresh', icon: RefreshCw, onSelect: notifyDataChanged },
      ])
    }
    window.addEventListener('contextmenu', onContext)
    return () => window.removeEventListener('contextmenu', onContext)
  }, [])
}

export function ContextMenuHost() {
  useGlobalContextMenu()
  const menu = useOpenMenu()

  useEffect(() => {
    if (!menu) return
    const close = () => closeMenu()
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  if (!menu) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      onMouseDown={closeMenu}
      onContextMenu={(e) => {
        e.preventDefault()
        closeMenu()
      }}
    >
      <MenuPanel key={`${menu.x},${menu.y}`} items={menu.items} x={menu.x} y={menu.y} root />
    </div>,
    document.body,
  )
}

function MenuPanel({ items, x, y, root = false, onBack }: { items: MenuEntry[]; x: number; y: number; root?: boolean; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [active, setActive] = useState(-1)
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (el) setPos(positionMenu(x, y, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight))
  }, [x, y])

  useEffect(() => {
    if (root || sub === null) ref.current?.focus()
  }, [root, sub])

  const run = (item: MenuItem, index: number) => {
    if (item.disabled) return
    if (item.submenu) {
      openSub(index)
      return
    }
    closeMenu()
    item.onSelect?.()
  }

  const openSub = (index: number) => {
    const row = ref.current?.querySelectorAll<HTMLElement>('[data-row]')[index]
    if (!row) return
    const r = row.getBoundingClientRect()
    setSub({ index, x: r.right - 2, y: r.top - 5 })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (sub !== null) return
    const item = items[active]
    if (e.key === 'ArrowDown') setActive(nextIndex(items, active, 1))
    else if (e.key === 'ArrowUp') setActive(nextIndex(items, active < 0 ? 0 : active, -1))
    else if (e.key === 'Escape') (onBack ?? closeMenu)()
    else if (e.key === 'ArrowLeft' && onBack) onBack()
    else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') && item && item !== 'separator') {
      if (e.key === 'ArrowRight' && !item.submenu) return
      run(item, active)
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  const subItem = sub !== null ? items[sub.index] : undefined

  return (
    <>
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => {
          // Keep focus (and any text selection) where it was, e.g. for Paste.
          e.preventDefault()
          e.stopPropagation()
        }}
        className="fixed min-w-52 rounded-xl border border-line-strong bg-raised/95 p-1 shadow-[0_20px_40px_-15px_rgb(0_0_0/0.8),0_0_30px_-5px_rgb(99_102_241/0.15)] outline-none backdrop-blur-xl"
        style={pos}
      >
        {items.map((entry, i) =>
          entry === 'separator' ? (
            <div key={`sep-${i}`} className="my-1 h-px bg-line" role="separator" />
          ) : (
            <button
              key={entry.label}
              data-row
              role="menuitem"
              disabled={entry.disabled}
              onMouseEnter={() => {
                setActive(i)
                if (entry.submenu && !entry.disabled) openSub(i)
                else setSub(null)
              }}
              onClick={() => run(entry, i)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40 ${
                active === i && !entry.disabled ? (entry.danger ? 'bg-danger/20 text-rose-200' : 'bg-accent/25 text-ink') : entry.danger ? 'text-rose-300' : 'text-ink'
              }`}
            >
              {entry.icon ? <entry.icon size={14} className="shrink-0 opacity-80" /> : <span className="w-3.5" />}
              <span className="flex-1 truncate">{entry.label}</span>
              {entry.shortcut && <span className="font-mono text-[10px] text-ink-3">{entry.shortcut}</span>}
              {entry.submenu && <ChevronRight size={13} className="text-ink-3" />}
            </button>
          ),
        )}
      </div>
      {sub !== null && subItem && subItem !== 'separator' && subItem.submenu && (
        <MenuPanel
          key={sub.index}
          items={subItem.submenu}
          x={sub.x}
          y={sub.y}
          onBack={() => {
            setSub(null)
            ref.current?.focus()
          }}
        />
      )}
    </>
  )
}
