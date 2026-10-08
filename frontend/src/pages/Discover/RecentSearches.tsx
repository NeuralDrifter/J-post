// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { History, Play, RefreshCw, Trash2 } from 'lucide-react'
import type { main } from '../../lib/backend'
import { timeAgo } from '../../lib/format'
import { openMenu } from '../../lib/menu'

type Props = {
  searches: main.SavedSearch[]
  onRun: (s: main.SavedSearch) => void
  onRefresh: (s: main.SavedSearch) => void
  onRemove: (s: main.SavedSearch) => void
}

export function RecentSearches({ searches, onRun, onRefresh, onRemove }: Props) {
  if (searches.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <History size={14} className="text-ink-3" />
      {searches.map((s) => (
        <button
          key={s.id}
          onClick={() => onRun(s)}
          onContextMenu={(e) =>
            openMenu(e, [
              { label: 'Run', icon: Play, onSelect: () => onRun(s) },
              { label: 'Refresh now', icon: RefreshCw, onSelect: () => onRefresh(s) },
              'separator',
              { label: 'Remove', icon: Trash2, danger: true, onSelect: () => onRemove(s) },
            ])
          }
          className="rounded-full border border-line bg-white/5 px-3 py-1 text-xs text-ink-2 transition hover:border-line-strong hover:text-ink"
          title={s.lastRunAt ? `Last run ${timeAgo(s.lastRunAt)}` : 'Not run yet'}
        >
          {s.term}
          {s.location && <span className="text-ink-3"> · {s.location}</span>}
          {s.remoteOnly && <span className="text-ink-3"> · remote</span>}
        </button>
      ))}
    </div>
  )
}
