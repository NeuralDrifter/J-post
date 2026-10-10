// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Link } from 'react-router'
import { LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { scoringStatus, searchStatus } from '../../lib/match'
import { settingsLink } from '../../lib/settingsNav'
import type { DiscoverProgress } from './useDiscoverProgress'

type Props = {
  progress: DiscoverProgress | null
  error: string
  onDismissError: () => void
  outdated: number // postings scored against an older resume or preferences
  onRescoreOutdated: () => void
  matchOff: boolean
}

/** One line under the search form: progress, else the last error, else what can be done about match scores. */
export function StatusLine({ progress, error, onDismissError, outdated, onRescoreOutdated, matchOff }: Props) {
  if (progress) {
    return (
      <p className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
        <LoaderCircle size={12} className="animate-spin" />
        {progress.phase === 'searching' ? searchStatus(progress.boards, progress.done, progress.total) : scoringStatus(progress.done, progress.total)}
      </p>
    )
  }
  if (error) {
    return (
      <p className="flex items-center gap-2 font-mono text-[11px] text-amber-300">
        <TriangleAlert size={12} />
        {error}
        <button onClick={onDismissError} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
          <X size={12} />
        </button>
      </p>
    )
  }
  if (outdated > 0) {
    return (
      <button className="self-start font-mono text-[11px] text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={onRescoreOutdated}>
        Re-score outdated ({outdated})
      </button>
    )
  }
  if (matchOff) {
    return (
      <p className="font-mono text-[11px] text-ink-3">
        Match scores are off.{' '}
        <Link to={settingsLink('matching')} className="text-indigo-300 hover:underline">
          Turn them on in Settings → Job matching
        </Link>
      </p>
    )
  }
  return null
}
