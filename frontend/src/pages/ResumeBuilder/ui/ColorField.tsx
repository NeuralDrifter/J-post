// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { hexToRgba, isValidHex, rgbaToHex } from '@reactive-resume/web/features/resume/editor/design/presets'

/** A colour stored as rgba(r, g, b, a), picked as a hex value with a swatch and a picker. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (rgba: string) => void }) {
  const hex = rgbaToHex(value) ?? '#000000'
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(hex)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setTyped(hex)
  }, [hex])
  useClickOutside(ref, open, () => setOpen(false))

  const commit = (next: string) => {
    if (isValidHex(next)) onChange(hexToRgba(next.trim()))
  }

  return (
    <div ref={ref} className="relative">
      <span className="label-mono mb-1.5 block">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Pick ${label.toLowerCase()}`}
          onClick={() => setOpen(!open)}
          className="h-8 w-8 shrink-0 rounded-lg border border-line-strong shadow-inner"
          style={{ backgroundColor: hex }}
        />
        <input
          className="field py-1.5 font-mono text-xs"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            commit(e.target.value)
          }}
          aria-label={label}
          spellCheck={false}
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-2 rounded-xl border border-line-strong bg-raised p-2 shadow-[0_20px_40px_-15px_rgb(0_0_0/0.8)]">
          <HexColorPicker color={hex} onChange={commit} />
        </div>
      )}
    </div>
  )
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOutside()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [ref, active, onOutside])
}
