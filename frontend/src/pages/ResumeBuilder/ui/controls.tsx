// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Small form controls for the builder's panels, in Job Track's style.
import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

/** A glass card whose body folds away under its header. */
export function Collapsible({
  title,
  icon,
  actions,
  open,
  onToggle,
  children,
}: {
  title: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const bodyId = useId()
  return (
    <section className="glass rounded-2xl">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={bodyId} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          {icon}
          <span className="truncate text-sm font-semibold">{title}</span>
        </button>
        {actions}
      </header>
      {open && (
        <div id={bodyId} className="space-y-3 border-t border-line px-3 py-3">
          {children}
        </div>
      )}
    </section>
  )
}

/** Collapsible that remembers its own open state. */
export function Fold({ title, icon, actions, defaultOpen = false, children }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible title={title} icon={icon} actions={actions} open={open} onToggle={() => setOpen(!open)}>
      {children}
    </Collapsible>
  )
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}

export type SegmentOption<T extends string> = { value: T; label: string }

/** A row of mutually exclusive buttons; null shows none selected. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: SegmentOption<T>[]; value: T | null; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-line bg-black/30 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${option.value === value ? 'bg-accent/25 text-ink shadow-[inset_0_0_0_1px_rgb(99_102_241/0.5)]' : 'text-ink-2 hover:text-ink'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A labelled range input that shows its value. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="font-mono text-[11px] text-ink-2">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" className="w-full accent-indigo-500" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}
