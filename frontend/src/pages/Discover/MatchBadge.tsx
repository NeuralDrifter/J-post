// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { KeyboardEvent, MouseEvent } from 'react'
import { RotateCw } from 'lucide-react'
import type { app } from '../../lib/backend'
import { matchBand, type MatchBand } from '../../lib/match'

const BAND_CLASS: Record<MatchBand, string> = {
  good: 'border-success/50 bg-success/15 text-emerald-300',
  fair: 'border-warn/50 bg-warn/15 text-amber-300',
  low: 'border-white/15 bg-white/5 text-ink-2',
}

type Props = {
  match?: app.MatchScore
  scoring: boolean // a run is going; unscored badges pulse
  onOpen: () => void
  onScore?: () => void // omitted where scoring isn't offered (Not interested tab)
}

// Lives inside the card's <button>, so it's a span with button behaviour and
// stops the click from also selecting the card.
function act(fn: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      e.stopPropagation()
      fn()
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }
    },
  }
}

export function MatchBadge({ match, scoring, onOpen, onScore }: Props) {
  if (match) {
    return (
      <span
        {...act(onOpen)}
        title={match.outdated ? 'Graded against an older resume or preferences. Click for details.' : 'Match score. Click for the breakdown.'}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${BAND_CLASS[matchBand(match.overall)]} ${match.outdated ? 'opacity-50' : ''}`}
      >
        {match.outdated && <RotateCw size={10} />}
        {match.overall}%
      </span>
    )
  }
  if (scoring) {
    return <span className="inline-block h-5 w-10 shrink-0 animate-pulse rounded-full bg-white/10" aria-label="Scoring" />
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-3">–</span>
      {onScore && (
        <span {...act(onScore)} className="text-[11px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Score this
        </span>
      )}
    </span>
  )
}
