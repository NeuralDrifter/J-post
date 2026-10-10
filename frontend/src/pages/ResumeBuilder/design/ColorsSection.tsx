// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Check } from 'lucide-react'
import { levelDesignSchema } from '@reactive-resume/schema/resume/data'
import { ACCENTS, hexToRgba, rgbaToHex } from '@reactive-resume/web/features/resume/editor/design/presets'
import { Field } from '../../../components/Field'
import { useResume, useUpdate } from '../editorContext'
import { ColorField } from '../ui/ColorField'

const LEVEL_LABELS: Record<string, string> = {
  hidden: 'Hidden',
  circle: 'Circles',
  square: 'Squares',
  rectangle: 'Bars',
  'rectangle-full': 'Full bars',
  'progress-bar': 'Progress bar',
  icon: 'Icons',
}

/** The accent colour (presets that read on white, or any), text and background, and how levels draw. */
export function ColorsSection() {
  const design = useResume().metadata.design
  const update = useUpdate()
  const primaryHex = rgbaToHex(design.colors.primary)
  const setColor = (key: keyof typeof design.colors, rgba: string) => update((d) => void (d.metadata.design.colors[key] = rgba))

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
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Text" value={design.colors.text} onChange={(v) => setColor('text', v)} />
        <ColorField label="Background" value={design.colors.background} onChange={(v) => setColor('background', v)} />
      </div>
      <Field label="Skill and language levels">
        <select className="field" value={design.level.type} onChange={(e) => update((d) => void (d.metadata.design.level.type = e.target.value as typeof design.level.type))}>
          {levelDesignSchema.shape.type.options.map((type) => (
            <option key={type} value={type}>
              {LEVEL_LABELS[type] ?? type}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}
