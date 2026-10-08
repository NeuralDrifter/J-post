// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { SOURCE_NUMBER, type SourceKey } from '../lib/sources'

const SUPERSCRIPT = ['', '¹', '²', '³']

/**
 * A quiet "✦¹" next to any figure that comes from an outside dataset. Hover or
 * focus shows exactly which release, occupation, area or state was used.
 */
export function SourceMark({ source, detail }: { source: SourceKey; detail: string }) {
  const n = SOURCE_NUMBER[source]
  return (
    <span className="group relative ml-0.5 inline-block align-super leading-none">
      <span
        tabIndex={0}
        aria-label={`Source ${n}: ${detail}`}
        className="cursor-help font-mono text-[9px] text-ink-3 outline-none transition hover:text-indigo-300 focus-visible:text-indigo-300"
      >
        ✦{SUPERSCRIPT[n]}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-left font-sans text-[11px] leading-snug font-normal tracking-normal text-ink-2 normal-case opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {detail}
      </span>
    </span>
  )
}
