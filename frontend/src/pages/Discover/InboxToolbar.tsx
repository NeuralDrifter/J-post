// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Search } from 'lucide-react'
import { POSTING_TABS } from '../../generated/choices'
import type { app } from '../../lib/backend'

export type Tab = (typeof POSTING_TABS)[number]

const TAB_LABEL: Record<Tab, string> = { inbox: 'Inbox', saved: 'Interested', dismissed: 'Not interested' }

/** Not interested postings older than this many days can be cleared. */
export const CLEAR_DISMISSED_DAYS = 90

export type InboxFilter = { query: string; source: string; onlyNew: boolean }

type Props = {
  tab: Tab
  onTab: (tab: Tab) => void
  counts: app.InboxCounts | undefined
  filter: InboxFilter
  onFilter: (filter: InboxFilter) => void
  sources: app.JobSource[]
  sort: string
  onSort: (sort: string) => void
  onClearOld: () => void
}

/** The inbox tabs with their counts, plus filter, source, sort and the tab's own extra (Only new, Clear old). */
export function InboxToolbar({ tab, onTab, counts, filter, onFilter, sources, sort, onSort, onClearOld }: Props) {
  const tabCount: Record<Tab, number | undefined> = { inbox: counts?.inbox, saved: counts?.saved, dismissed: counts?.dismissed }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-line bg-white/5 p-0.5">
        {POSTING_TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
              tab === t ? 'bg-accent/30 text-ink' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {TAB_LABEL[t]}
            {tabCount[t] !== undefined && <span className="font-mono text-[10px] text-ink-3">{tabCount[t]}</span>}
            {t === 'inbox' && (counts?.new ?? 0) > 0 && (
              <span className="rounded-full bg-info/20 px-1.5 font-mono text-[10px] text-cyan-300">{counts?.new} new</span>
            )}
          </button>
        ))}
      </div>
      <label className="relative">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
        <input className="field w-48 py-1 pl-7 text-xs" placeholder="Filter" value={filter.query} onChange={(e) => onFilter({ ...filter, query: e.target.value })} />
      </label>
      <select className="field w-auto py-1 text-xs" value={filter.source} onChange={(e) => onFilter({ ...filter, source: e.target.value })}>
        <option value="">Any source</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <select className="field w-auto py-1 text-xs" value={sort} onChange={(e) => onSort(e.target.value)} aria-label="Sort">
        <option value="newest">Newest</option>
        <option value="match">Best match</option>
      </select>
      {tab === 'inbox' && (
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" className="accent-indigo-500" checked={filter.onlyNew} onChange={(e) => onFilter({ ...filter, onlyNew: e.target.checked })} />
          Only new
        </label>
      )}
      {tab === 'dismissed' && (counts?.dismissed ?? 0) > 0 && (
        <button className="ml-auto text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={onClearOld}>
          Clear older than {CLEAR_DISMISSED_DAYS} days
        </button>
      )}
    </div>
  )
}
