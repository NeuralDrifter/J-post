// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { IconButton } from '../../../components/IconButton'
import { totalPending } from '../../../lib/resumes/ai/review'
import { useReview } from './ReviewContext'

/** "4 changes to review" in the top bar, with a step to the previous or next section that has some. */
export function ReviewBar() {
  const { reviews } = useReview()
  const pending = totalPending(reviews)
  if (pending === 0) return null
  const sections = reviews.filter((r) => r.pending > 0).map((r) => r.sectionId)
  return (
    <span className="flex items-center gap-0.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 pl-2 text-xs text-indigo-100">
      <Sparkles size={12} className="mr-1" />
      {pending} change{pending === 1 ? '' : 's'} to review
      <IconButton label="Previous section with changes" onClick={() => step(sections, -1)}>
        <ChevronUp size={14} />
      </IconButton>
      <IconButton label="Next section with changes" onClick={() => step(sections, 1)}>
        <ChevronDown size={14} />
      </IconButton>
    </span>
  )
}

let lastShown = -1

/** Scrolls the content panel to the next (or previous) section with changes waiting, wrapping around. */
function step(sections: readonly string[], direction: 1 | -1) {
  lastShown = (lastShown + direction + sections.length) % sections.length
  document.querySelector(`[data-review="${CSS.escape(sections[lastShown])}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
