// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { splitPlaceholders, wordDiff } from '../../../lib/resumes/ai/diff'

const PART_STYLE = {
  same: '',
  removed: 'bg-rose-500/10 text-rose-300/80 line-through decoration-rose-400/70',
  added: 'bg-emerald-500/10 text-emerald-200 underline decoration-emerald-400/70 underline-offset-2',
} as const

/** Track Changes for one change: removed words struck in red, added words underlined in green, placeholders in amber. */
export function DiffText({ before, after }: { before: string; after: string }) {
  return (
    <span className="whitespace-pre-wrap text-xs leading-relaxed">
      {wordDiff(before, after).map((part, i) => (
        <span key={i} className={PART_STYLE[part.kind]}>
          {part.kind === 'removed' ? part.text : <Placeholders text={part.text} />}
        </span>
      ))}
    </span>
  )
}

/** "[x]%" and the like: a figure only the user can supply, so it stands out until it's filled in. */
function Placeholders({ text }: { text: string }) {
  return splitPlaceholders(text).map((part, i) =>
    part.placeholder ? (
      <mark key={i} className="rounded bg-amber-400/25 px-0.5 text-amber-200 no-underline" title="Fill this in with the real figure">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  )
}
