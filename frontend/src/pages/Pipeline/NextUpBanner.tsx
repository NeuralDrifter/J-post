// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { CalendarClock, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { main } from '../../lib/backend'
import { formatDateTime, INTERVIEW_KIND_LABEL, labelFor } from '../../lib/format'

export function NextUpBanner({ nextUp }: { nextUp?: main.NextUp }) {
  const navigate = useNavigate()
  if (!nextUp) return null
  const iv = nextUp.interview
  return (
    <button
      onClick={() => navigate(`/jobs/${iv.jobId}`)}
      className="glass flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition hover:border-line-strong"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
        <CalendarClock size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] tracking-wider text-info uppercase">Next up · {formatDateTime(iv.scheduledAt)}</p>
        <p className="truncate text-sm font-semibold">
          {labelFor(INTERVIEW_KIND_LABEL, iv.kind)} — {nextUp.position} at {nextUp.company}
        </p>
      </div>
      {iv.locationOrLink && (
        <span className="hidden max-w-xs truncate font-mono text-xs text-ink-2 min-[1100px]:block">{iv.locationOrLink}</span>
      )}
      <ChevronRight size={16} className="shrink-0 text-ink-3" />
    </button>
  )
}
