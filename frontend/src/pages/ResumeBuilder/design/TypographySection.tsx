// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { FontWeight } from '@reactive-resume/fonts'
import { getNextWeights } from '@reactive-resume/web/components/typography/get-next-weights'
import { applyFontPairing, applyTextSize, FONT_PAIRINGS, matchFontPairing, TEXT_SIZE, type FontPairingId } from '@reactive-resume/web/features/resume/editor/design/presets'
import { fontWeights, toggleWeight } from '../../../lib/resumes/fonts'
import { FontCombobox } from '../ui/FontCombobox'
import { Segmented, Slider, Toggle } from '../ui/controls'
import { useDesign } from './designContext'

type Role = 'body' | 'heading'

const PAIRING_OPTIONS = FONT_PAIRINGS.map((p) => ({ value: p.id, label: p.label }))

const WEIGHT_NAMES: Record<string, string> = { '100': 'Thin', '200': 'Extra light', '300': 'Light', '400': 'Regular', '500': 'Medium', '600': 'Semibold', '700': 'Bold', '800': 'Extra bold', '900': 'Black' }

/** Font pairing presets, then each family with its weights, the text size and line spacing. */
export function TypographySection() {
  const { metadata, updateMetadata } = useDesign()
  const typography = metadata.typography
  const pairing = matchFontPairing({ typography })

  // A new family starts with Reactive Resume's choice of weights: regular and bold for text, one for headings.
  const setFamily = (role: Role, family: string) =>
    updateMetadata((m) => {
      m.typography[role].fontFamily = family
      m.typography[role].fontWeights = getNextWeights(family, role === 'heading') ?? ['400']
    })
  const setWeights = (role: Role, weight: FontWeight) => updateMetadata((m) => void (m.typography[role].fontWeights = toggleWeight(m.typography[role].fontWeights as FontWeight[], weight)))

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="label-mono">Pairing</span>
        <Segmented<FontPairingId> label="Font pairing" options={PAIRING_OPTIONS} value={pairing} onChange={(id) => updateMetadata((m) => applyFontPairing(m, id))} />
      </div>
      {(['heading', 'body'] as const).map((role) => (
        <div key={role} className="space-y-1.5">
          <span className="label-mono">{role === 'heading' ? 'Headings' : 'Text'}</span>
          <FontCombobox label={role === 'heading' ? 'Heading font' : 'Text font'} value={typography[role].fontFamily} onChange={(f) => setFamily(role, f)} />
          <WeightChips family={typography[role].fontFamily} selected={typography[role].fontWeights as FontWeight[]} onToggle={(w) => setWeights(role, w)} />
        </div>
      ))}
      <Slider
        label="Text size"
        value={typography.body.fontSize}
        min={TEXT_SIZE.min}
        max={TEXT_SIZE.max}
        step={TEXT_SIZE.step}
        unit=" pt"
        onChange={(size) => updateMetadata((m) => applyTextSize(m, size))}
      />
      <Slider label="Line spacing" value={typography.body.lineHeight} min={1} max={2.2} step={0.05} unit="×" onChange={(v) => updateMetadata((m) => void (m.typography.body.lineHeight = v))} />
      <Toggle label="Hyphenate long words" checked={typography.hyphenation ?? false} onChange={(v) => updateMetadata((m) => void (m.typography.hyphenation = v))} />
    </div>
  )
}

/** The family's weights as toggles: the ones the page loads, the last being its bold. */
function WeightChips({ family, selected, onToggle }: { family: string; selected: FontWeight[]; onToggle: (weight: FontWeight) => void }) {
  const available = fontWeights(family)
  if (available.length < 2) return null
  return (
    <div role="group" aria-label="Weights" className="flex flex-wrap gap-1">
      {available.map((weight) => {
        const on = selected.includes(weight)
        return (
          <button
            key={weight}
            type="button"
            aria-pressed={on}
            title={WEIGHT_NAMES[weight] ?? weight}
            onClick={() => onToggle(weight)}
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition ${on ? 'border-accent bg-accent/20 text-indigo-100' : 'border-line text-ink-3 hover:text-ink-2'}`}
          >
            {weight}
          </button>
        )
      })}
    </div>
  )
}
