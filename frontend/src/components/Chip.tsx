// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react'
import { CLOSE_REASON_LABEL, labelFor, lookup, STATUS_DOT, STATUS_LABEL } from '../lib/format'

const TONES = {
  neutral: 'border-white/10 bg-white/5 text-ink-2',
  success: 'border-success/40 bg-success/10 text-emerald-300',
  info: 'border-info/30 bg-info/10 text-cyan-300',
  warn: 'border-warn/40 bg-warn/10 text-amber-300',
  danger: 'border-danger/40 bg-danger/10 text-rose-300',
  accent: 'border-accent/40 bg-accent/15 text-indigo-200',
} as const

export type ChipTone = keyof typeof TONES

export function Chip({ tone = 'neutral', children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}

export function StatusChip({ status, closeReason }: { status: string; closeReason?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-2">
      <span className={`h-2 w-2 rounded-full ${lookup(STATUS_DOT, status, 'bg-ink-3')}`} />
      {labelFor(STATUS_LABEL, status)}
      {status === 'closed' && closeReason && <span className="text-ink-3">· {labelFor(CLOSE_REASON_LABEL, closeReason)}</span>}
    </span>
  )
}
