// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { formatYearMonth, toYearMonth, type DateFormat, type ResumeDates, type YearMonth } from '@reactive-resume/schema/resume/dates'
import { readSingleDate } from '@reactive-resume/schema/resume/period'
import { Field } from '../../../components/Field'

export function TextInput({ label, value, onChange, placeholder, wide }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; wide?: boolean }) {
  return (
    <Field label={label} wide={wide}>
      <input className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** Tags typed one at a time: Enter or a comma adds one, × removes it. */
export function KeywordsField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [typed, setTyped] = useState('')
  const add = () => {
    const keyword = typed.trim()
    if (keyword && !value.includes(keyword)) onChange([...value, keyword])
    setTyped('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !typed && value.length > 0) onChange(value.slice(0, -1))
  }
  return (
    <div className="col-span-2 space-y-1.5">
      <span className="label-mono">{label}</span>
      <div className="field flex flex-wrap items-center gap-1.5 py-1.5">
        {value.map((keyword) => (
          <span key={keyword} className="inline-flex items-center gap-1 rounded-md border border-line bg-white/5 px-1.5 py-0.5 text-xs">
            {keyword}
            <button type="button" aria-label={`Remove ${keyword}`} onClick={() => onChange(value.filter((k) => k !== keyword))} className="text-ink-3 hover:text-ink">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          value={typed}
          placeholder={value.length ? '' : 'Type and press Enter'}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          aria-label={label}
        />
      </div>
    </div>
  )
}

const LEVELS = [0, 1, 2, 3, 4, 5] as const

/** 0–5, where 0 hides the level on the resume. */
export function LevelField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <span className="label-mono">Level</span>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Level">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            title={level === 0 ? 'Hidden' : `${level} of 5`}
            onClick={() => onChange(level)}
            className={`h-6 w-6 rounded-md border font-mono text-[11px] transition ${
              level === 0 ? 'border-line text-ink-3' : level <= value ? 'border-accent bg-accent/40 text-ink' : 'border-line bg-white/5 text-ink-3'
            } ${value === level ? 'ring-2 ring-accent/50' : ''}`}
          >
            {level === 0 ? '–' : level}
          </button>
        ))}
      </div>
    </div>
  )
}

export type Website = { url: string; label: string; inlineLink?: boolean }

export function WebsiteField({ value, onChange }: { value: Website; onChange: (v: Website) => void }) {
  return (
    <>
      <TextInput label="Website" value={value.url} placeholder="https://" onChange={(url) => onChange({ ...value, url })} />
      <TextInput label="Link text" value={value.label} placeholder="Shown instead of the URL" onChange={(label) => onChange({ ...value, label })} />
    </>
  )
}

/** How the resume prints dates: its locale and date format. */
export type DateSettings = { locale: string; format?: DateFormat | undefined }

/** Start and end (or one date), typed the way people write them; "Present" for ongoing entries. */
export function DatesField({ dates, single, settings, onChange }: { dates: ResumeDates; single: boolean; settings: DateSettings; onChange: (d: ResumeDates) => void }) {
  // Editing a date drops `raw`, the unreadable text an import brought in.
  const edit = (patch: Partial<ResumeDates>) => {
    const { raw: _raw, ...rest } = dates
    onChange({ ...rest, ...patch })
  }
  if (single) return <MonthYearInput label="Date" value={dates.start} settings={settings} onCommit={(start) => edit({ start })} />
  return (
    <div className="col-span-2 grid grid-cols-[1fr_1fr_auto] items-end gap-3">
      <MonthYearInput label="Start" value={dates.start} settings={settings} onCommit={(start) => edit({ start })} />
      {dates.present ? (
        <Field label="End">
          <input className="field" value="Present" disabled />
        </Field>
      ) : (
        <MonthYearInput label="End" value={dates.end} settings={settings} onCommit={(end) => edit({ end })} />
      )}
      <label className="flex h-[38px] items-center gap-1.5 text-xs text-ink-2">
        <input type="checkbox" className="accent-indigo-500" checked={dates.present} onChange={(e) => edit({ present: e.target.checked, end: null })} />
        Present
      </label>
      {dates.raw !== undefined && <p className="col-span-3 text-xs text-warn">Imported as “{dates.raw}”, which prints as written until you set the dates.</p>}
    </div>
  )
}

function readTypedDate(text: string, locale: string): YearMonth | null | undefined {
  const value = text.trim()
  if (!value) return null
  const reading = readSingleDate(value, locale)
  return reading ? toYearMonth(reading.endpoint) : undefined
}

/** One date ("Mar 2022", "03/2022", "2022-03" or "2022"): saved as soon as it reads, shown formatted on blur. */
function MonthYearInput({ label, value, settings, onCommit }: { label: string; value: YearMonth | null; settings: DateSettings; onCommit: (v: YearMonth | null) => void }) {
  const [typed, setTyped] = useState<string | null>(null)
  const formatted = value ? formatYearMonth(value, settings) : ''
  const invalid = typed !== null && readTypedDate(typed, settings.locale) === undefined
  return (
    <Field label={label}>
      <input
        className={`field ${invalid ? 'border-danger/60' : ''}`}
        value={typed ?? formatted}
        placeholder="Mar 2022"
        aria-invalid={invalid}
        onChange={(e) => {
          setTyped(e.target.value)
          const read = readTypedDate(e.target.value, settings.locale)
          if (read !== undefined) onCommit(read)
        }}
        onBlur={() => setTyped(null)}
      />
    </Field>
  )
}
