// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useId, useState } from 'react'
import { fontList, getFont, type FontWeight } from '@reactive-resume/fonts'
import { applyFontPairing, applyTextSize, FONT_PAIRINGS, matchFontPairing, TEXT_SIZE, type FontPairingId } from '@reactive-resume/web/features/resume/editor/design/presets'
import { Field } from '../../../components/Field'
import { useResume, useUpdate } from '../editorContext'
import { Segmented, Slider, Toggle } from '../ui/controls'

type Role = 'body' | 'heading'

const PAIRING_OPTIONS = FONT_PAIRINGS.map((p) => ({ value: p.id, label: p.label }))

/** The weights a newly chosen family starts with: Regular and Bold for text, the boldest for headings. */
function defaultWeights(family: string, role: Role): FontWeight[] {
  const weights = (getFont(family)?.weights ?? ['400']) as FontWeight[]
  if (role === 'heading') return [weights.includes('700') ? '700' : (weights.at(-1) ?? '700')]
  const regularAndBold = weights.filter((w) => w === '400' || w === '700')
  return regularAndBold.length ? regularAndBold : [weights[0] ?? '400']
}

/** Font pairing presets, then each family, the text size and line spacing. */
export function TypographySection() {
  const typography = useResume().metadata.typography
  const update = useUpdate()
  const pairing = matchFontPairing({ typography })

  const setFamily = (role: Role, family: string) =>
    update((d) => {
      d.metadata.typography[role].fontFamily = family
      d.metadata.typography[role].fontWeights = defaultWeights(family, role)
    })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="label-mono">Pairing</span>
        <Segmented<FontPairingId> label="Font pairing" options={PAIRING_OPTIONS} value={pairing} onChange={(id) => update((d) => applyFontPairing(d.metadata, id))} />
      </div>
      <FontPicker label="Headings" family={typography.heading.fontFamily} onChange={(f) => setFamily('heading', f)} />
      <FontPicker label="Text" family={typography.body.fontFamily} onChange={(f) => setFamily('body', f)} />
      <Slider
        label="Text size"
        value={typography.body.fontSize}
        min={TEXT_SIZE.min}
        max={TEXT_SIZE.max}
        step={TEXT_SIZE.step}
        unit=" pt"
        onChange={(size) => update((d) => applyTextSize(d.metadata, size))}
      />
      <Slider label="Line spacing" value={typography.body.lineHeight} min={1} max={2.2} step={0.05} unit="×" onChange={(v) => update((d) => void (d.metadata.typography.body.lineHeight = v))} />
      <Toggle label="Hyphenate long words" checked={typography.hyphenation ?? false} onChange={(v) => update((d) => void (d.metadata.typography.hyphenation = v))} />
    </div>
  )
}

/** Any of the template fonts, searched by typing; applied once the name matches a font. */
function FontPicker({ label, family, onChange }: { label: string; family: string; onChange: (family: string) => void }) {
  const listId = useId()
  const [typed, setTyped] = useState<string | null>(null)
  return (
    <Field label={label}>
      <input
        className="field"
        list={listId}
        value={typed ?? family}
        style={{ fontFamily: family }}
        onChange={(e) => {
          setTyped(e.target.value)
          if (getFont(e.target.value)) onChange(e.target.value)
        }}
        onBlur={() => setTyped(null)}
      />
      <datalist id={listId}>
        {fontList.map((font) => (
          <option key={font.family} value={font.family}>
            {font.category}
          </option>
        ))}
      </datalist>
    </Field>
  )
}
