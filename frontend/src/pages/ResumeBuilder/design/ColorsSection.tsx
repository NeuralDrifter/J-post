// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { AlertTriangle, Check } from 'lucide-react'
import { contrastOnWhite } from '@reactive-resume/utils/color'
import { ACCENTS, darkenForWhite, hexToRgba, rgbaToHex } from '@reactive-resume/web/features/resume/editor/design/presets'
import { useDesign } from './designContext'
import { LevelStylePicker } from './LevelStylePicker'
import { ColorField } from '../ui/ColorField'

/** Text in the accent colour needs at least this contrast on a white page to read. */
const MIN_ACCENT_CONTRAST = 4.6

/** The accent colour (presets that read on white, or any), text and background, and how levels draw. */
export function ColorsSection() {
  const { metadata, updateMetadata } = useDesign()
  const design = metadata.design
  const primaryHex = rgbaToHex(design.colors.primary)
  const setColor = (key: keyof typeof design.colors, rgba: string) => updateMetadata((m) => void (m.design.colors[key] = rgba))

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="label-mono">Accent</span>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((accent) => (
            <button
              key={accent.hex}
              type="button"
              title={accent.label}
              aria-label={accent.label}
              aria-pressed={primaryHex === accent.hex}
              onClick={() => setColor('primary', hexToRgba(accent.hex))}
              className="grid h-7 w-7 place-items-center rounded-full border border-white/20 transition hover:scale-110"
              style={{ backgroundColor: accent.hex }}
            >
              {primaryHex === accent.hex && <Check size={13} className="text-white" />}
            </button>
          ))}
        </div>
      </div>
      <ColorField label="Accent colour" value={design.colors.primary} onChange={(v) => setColor('primary', v)} />
      {primaryHex && contrastOnWhite(primaryHex) < MIN_ACCENT_CONTRAST && <LightAccentWarning onDarken={() => setColor('primary', hexToRgba(darkenForWhite(primaryHex)))} />}
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Text" value={design.colors.text} onChange={(v) => setColor('text', v)} />
        <ColorField label="Background" value={design.colors.background} onChange={(v) => setColor('background', v)} />
      </div>
      <LevelStylePicker />
    </div>
  )
}

/** The accent is too light to read on white; one click darkens the same hue until it does. */
function LightAccentWarning({ onDarken }: { onDarken: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-xs text-amber-200">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span className="flex-1">This accent is hard to read on a white page.</span>
      <button type="button" className="btn btn-ghost shrink-0 py-0.5 text-xs" onClick={onDarken}>
        Use a darker shade
      </button>
    </div>
  )
}
