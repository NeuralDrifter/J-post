// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { marketdata } from '../../lib/backend'

type Props = {
  value: string
  onChange: (code: string, option?: marketdata.Option) => void
  search: (q: string) => Promise<marketdata.Option[]>
  describe: (code: string) => Promise<marketdata.Option>
  placeholder: string
}

/** Searchable picker for BLS occupation codes and BLS/BEA area codes. */
export function CodePicker({ value, onChange, search, describe, placeholder }: Props) {
  const [text, setText] = useState('')
  const [options, setOptions] = useState<marketdata.Option[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const describeRef = useRef(describe)
  describeRef.current = describe

  // Show the title for the saved code.
  useEffect(() => {
    if (!value) {
      setText('')
      return
    }
    describeRef.current(value).then((o) => setText(o.title)).catch(() => setText(value))
  }, [value])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      search(text).then((o) => {
        setOptions(o)
        setActive(0)
      }).catch(() => setOptions([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [text, open, search])

  const choose = (o: marketdata.Option) => {
    onChange(o.code, o)
    setText(o.title)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
      <input
        className="field pr-8 pl-8"
        value={text}
        placeholder={placeholder}
        onFocus={(e) => {
          e.target.select()
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (!open || options.length === 0) return
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, options.length - 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          else if (e.key === 'Enter') choose(options[active])
          else return
          e.preventDefault()
        }}
      />
      {value && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-3 hover:text-ink"
          onClick={() => onChange('')}
          aria-label="Clear"
        >
          <X size={14} />
        </button>
      )}
      {open && options.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line-strong bg-raised p-1 shadow-2xl">
          {options.map((o, i) => (
            <li key={o.code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm ${
                  i === active ? 'bg-accent/20' : 'hover:bg-white/5'
                }`}
              >
                <span className="truncate">{o.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-3">{o.type ? o.type : o.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
