// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { loadFontPreview, previewFamily, searchFonts, type FontChoice } from '../../../lib/resumes/fonts'

/** How many matches the list shows; typing narrows it. */
const MAX_SHOWN = 80

/** Picks a font family by typing; every name in the list is shown in its own face. */
export function FontCombobox({ label, value, onChange }: { label: string; value: string; onChange: (family: string) => void }) {
  const listId = useId()
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const open = query !== null
  const choices = open ? searchFonts(query, MAX_SHOWN) : []

  const close = () => setQuery(null)
  const choose = (family: string) => {
    onChange(family)
    close()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) return setQuery('')
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, choices.length - 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter' && choices[active]) choose(choices[active].family)
    else if (e.key === 'Escape') close()
    else return
    e.preventDefault()
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && choices[active] ? `${listId}-${active}` : undefined}
          className="field pr-8"
          style={{ fontFamily: `'${previewFamily(value)}', '${value}', sans-serif` }}
          value={query ?? value}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onClick={() => open || setQuery('')}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-3" />
        <FontPreviewLoader family={value} />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="glass absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl bg-raised/95 p-1 shadow-2xl">
          {choices.length === 0 && <li className="px-2.5 py-2 text-xs text-ink-3">No font matches.</li>}
          {choices.map((font, index) => (
            <FontOption key={font.family} id={`${listId}-${index}`} font={font} active={index === active} selected={font.family === value} onChoose={() => choose(font.family)} />
          ))}
        </ul>
      )}
    </div>
  )
}

type OptionProps = { id: string; font: FontChoice; active: boolean; selected: boolean; onChoose: () => void }

function FontOption({ id, font, active, selected, onChoose }: OptionProps) {
  const row = useRef<HTMLLIElement>(null)
  const shown = useFontWhenVisible(font.family, row)
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <li
      ref={row}
      id={id}
      role="option"
      aria-selected={selected}
      // mousedown, so the choice lands before the input's blur closes the list
      onMouseDown={(e) => {
        e.preventDefault()
        onChoose()
      }}
      className={`flex cursor-pointer items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5 ${active ? 'bg-accent/20' : 'hover:bg-white/5'} ${selected ? 'text-indigo-100' : ''}`}
    >
      <span className={`truncate text-sm transition-opacity ${shown ? '' : 'opacity-50'}`} style={{ fontFamily: shown ? `'${previewFamily(font.family)}', sans-serif` : undefined }}>
        {font.label}
      </span>
      <span className="shrink-0 text-[10px] text-ink-3">{font.category}</span>
    </li>
  )
}

/** Loads the chosen family's preview so the field itself shows it. */
function FontPreviewLoader({ family }: { family: string }) {
  useEffect(() => {
    loadFontPreview(family).catch(() => undefined) // shown in a fallback face meanwhile
  }, [family])
  return null
}

/** Loads a family's preview face once its row scrolls into view; true when it's ready. */
function useFontWhenVisible(family: string, row: React.RefObject<HTMLElement | null>): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const element = row.current
    if (!element) return
    let cancelled = false
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      loadFontPreview(family).then(
        () => !cancelled && setShown(true),
        () => undefined, // stays in the fallback face
      )
    })
    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [family, row])
  return shown
}
