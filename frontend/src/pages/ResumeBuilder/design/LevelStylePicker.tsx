// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react'
import { Star } from 'lucide-react'
import { levelDesignSchema } from '@reactive-resume/schema/resume/data'
import { useDesign } from './designContext'

type LevelType = (typeof levelDesignSchema.shape.type.options)[number]

const LEVEL_LABELS: Record<LevelType, string> = {
  hidden: 'Hidden',
  circle: 'Circles',
  square: 'Squares',
  rectangle: 'Bars',
  'rectangle-full': 'Full bars',
  'progress-bar': 'Progress',
  icon: 'Icons',
}

/** How skill and language levels draw, each choice shown as a level of three out of five. */
export function LevelStylePicker() {
  const { metadata, updateMetadata } = useDesign()
  const level = metadata.design.level
  return (
    <div className="space-y-1.5">
      <span className="label-mono">Skill and language levels</span>
      <div role="radiogroup" aria-label="Level style" className="grid grid-cols-4 gap-1.5">
        {levelDesignSchema.shape.type.options.map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={level.type === type}
            onClick={() => updateMetadata((m) => void (m.design.level.type = type))}
            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] transition ${level.type === type ? 'border-accent bg-accent/15 text-ink' : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-2'}`}
          >
            <span className="flex h-3 items-center">
              <LevelSample type={type} />
            </span>
            {LEVEL_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  )
}

const FILLED = 3
const STEPS = 5

/** A tiny drawing of a level in this style. */
function LevelSample({ type }: { type: LevelType }) {
  if (type === 'hidden') return <span className="text-ink-3">—</span>
  if (type === 'progress-bar') return <Bar fill={FILLED / STEPS} />
  const mark = (on: boolean, i: number): ReactNode => {
    const tone = on ? 'bg-indigo-300' : 'bg-white/15'
    if (type === 'icon') return <Star key={i} size={8} className={on ? 'fill-indigo-300 text-indigo-300' : 'text-white/25'} />
    const shape = type === 'circle' ? 'size-1.5 rounded-full' : type === 'square' ? 'size-1.5' : type === 'rectangle' ? 'h-1.5 w-2.5 rounded-sm' : 'h-1.5 w-2.5'
    return <span key={i} className={`${shape} ${tone}`} />
  }
  return <span className={`flex items-center ${type === 'rectangle-full' ? 'gap-0' : 'gap-0.5'}`}>{Array.from({ length: STEPS }, (_, i) => mark(i < FILLED, i))}</span>
}

function Bar({ fill }: { fill: number }) {
  return (
    <span className="block h-1.5 w-10 overflow-hidden rounded-full bg-white/15">
      <span className="block h-full rounded-full bg-indigo-300" style={{ width: `${fill * 100}%` }} />
    </span>
  )
}
