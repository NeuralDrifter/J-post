// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban } from 'lucide-react'
import { loadIconDrawings, searchIcons, type IconDrawings } from '../../../lib/resumes/icons'

/** How many icons the grid shows; searching narrows them. */
const MAX_SHOWN = 240
const PANEL_WIDTH = 300

/** The icon drawings once loaded; undefined meanwhile. */
function useIconDrawings(): IconDrawings | undefined {
  const [drawings, setDrawings] = useState<IconDrawings>()
  useEffect(() => {
    let cancelled = false
    loadIconDrawings().then(
      (loaded) => !cancelled && setDrawings(loaded),
      () => undefined, // icons stay blank; names still show as titles
    )
    return () => {
      cancelled = true
    }
  }, [])
  return drawings
}

/** A Phosphor icon, drawn from the same paths as the PDF (static, vendored data). */
export function PhosphorGlyph({ name, size = 16, drawings }: { name: string; size?: number; drawings: IconDrawings | undefined }) {
  const markup = drawings?.[name]
  if (!markup) return <span style={{ width: size, height: size }} className="inline-block" />
  return <svg viewBox="0 0 256 256" width={size} height={size} fill="currentColor" aria-hidden dangerouslySetInnerHTML={{ __html: markup }} />
}

type GridProps = {
  value: string
  onChange: (icon: string) => void
  /** What "no icon" means here: "" (the template's default) or "none" (hidden). */
  noneValue: string
  noneLabel: string
}

/** Search and a grid of icons, with a "no icon" choice first. */
export function IconGrid({ value, onChange, noneValue, noneLabel }: GridProps) {
  const drawings = useIconDrawings()
  const [query, setQuery] = useState('')
  const shown = drawings ? searchIcons(drawings, query, MAX_SHOWN) : []
  const cell = (selected: boolean) => `grid size-8 place-items-center rounded-md transition ${selected ? 'bg-accent/30 text-ink ring-1 ring-accent' : 'text-ink-2 hover:bg-white/10 hover:text-ink'}`
  return (
    <div className="space-y-2">
      <input autoFocus className="field py-1.5 text-xs" placeholder="Search icons, e.g. map pin" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search icons" />
      <div role="listbox" aria-label="Icons" className="grid max-h-64 grid-cols-8 gap-0.5 overflow-y-auto">
        <button type="button" role="option" aria-selected={value === noneValue} title={noneLabel} onClick={() => onChange(noneValue)} className={cell(value === noneValue)}>
          <Ban size={14} />
        </button>
        {shown.map((name) => (
          <button key={name} type="button" role="option" aria-selected={value === name} title={name} onClick={() => onChange(name)} className={cell(value === name)}>
            <PhosphorGlyph name={name} drawings={drawings} />
          </button>
        ))}
      </div>
      {drawings && shown.length === 0 && <p className="text-xs text-ink-3">No icon matches.</p>}
    </div>
  )
}

type PickerProps = { label: string; value: string; onChange: (icon: string) => void; noneValue?: string; noneLabel?: string }

/** A button showing the chosen icon; it opens the icon grid beside it. */
export function IconPicker({ label, value, onChange, noneValue = '', noneLabel = 'No icon' }: PickerProps) {
  const drawings = useIconDrawings()
  const trigger = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (rect) setAt({ left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)), top: rect.bottom + 4 })
  }
  const choose = (icon: string) => {
    onChange(icon)
    setAt(null)
  }
  const shown = value && value !== noneValue
  return (
    <>
      <button ref={trigger} type="button" aria-label={label} title={shown ? value : noneLabel} onClick={open} className="field flex h-[34px] w-[42px] items-center justify-center p-0">
        {shown ? <PhosphorGlyph name={value} drawings={drawings} /> : <Ban size={14} className="text-ink-3" />}
      </button>
      {at && <IconPopover at={at} onClose={() => setAt(null)}>{<IconGrid value={value} onChange={choose} noneValue={noneValue} noneLabel={noneLabel} />}</IconPopover>}
    </>
  )
}

/** The grid floating under its button; a click outside or Esc closes it. */
function IconPopover({ at, onClose, children }: { at: { left: number; top: number }; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // don't also close a dialog underneath
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])
  return createPortal(
    <div ref={panel} className="glass fixed z-[70] rounded-2xl bg-raised/95 p-2.5 shadow-2xl" style={{ left: at.left, top: at.top, width: PANEL_WIDTH }}>
      {children}
    </div>,
    document.body,
  )
}
