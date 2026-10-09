// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Inbox, LoaderCircle, Search, Telescope, TriangleAlert, X } from 'lucide-react'
import { confirmDialog } from '../../components/ConfirmDialog'
import { PageTitle } from '../../components/PageTitle'
import { api, apiOk } from '../../lib/api'
import {
  ClearDismissed,
  DeleteSearch,
  DismissPosting,
  EventsOn,
  GetSettings,
  InboxCounts,
  ListAIProviders,
  ListJobSources,
  ListPostings,
  ListRecentSearches,
  MarkPostingSeen,
  RefreshSearch,
  RescoreOutdated,
  RestorePosting,
  RunSearch,
  SavePosting,
  ScoreInbox,
  ScorePosting,
  type app,
} from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { timeAgo } from '../../lib/format'
import { defaultSourceIds, sourceLabel } from '../../lib/jobSources'
import { readPref, readSessionValue, writePref, writeSessionValue } from '../../lib/prefs'
import { settingsLink } from '../../lib/settingsNav'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { outdatedCount, scoringStatus, searchStatus, shouldAutoScore, sortByMatch } from '../../lib/match'
import { MatchDialog } from './MatchDialog'
import { PostingList, type PostingActions } from './PostingList'
import { PreviewPane } from './PreviewPane'
import { RecentSearches } from './RecentSearches'
import { SearchForm } from './SearchForm'

type Tab = 'inbox' | 'saved' | 'dismissed'
const TABS: { id: Tab; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'saved', label: 'Interested' },
  { id: 'dismissed', label: 'Not interested' },
]

const QUERY_PREF = 'discoverQuery'
const SORT_PREF = 'discoverSort'

/** The last query, or an empty one (its boards are filled in once the list loads). */
function loadQuery(): app.SearchQuery {
  const empty = { term: '', location: '', remoteOnly: false, sources: [], perSource: {} }
  try {
    return { ...empty, ...(JSON.parse(readPref(QUERY_PREF, '{}')) as Partial<app.SearchQuery>) }
  } catch {
    return empty
  }
}

/** RunSearch (reuses recent results) or RefreshSearch (always fetches). */
type SearchCall = (q: app.SearchQuery) => Promise<app.SearchRun>

const hasSavedQuery = () => readPref(QUERY_PREF, '') !== ''

// The last search outcome survives navigating away and back (not a restart).
const LAST_RUN_KEY = 'discoverLastRun'

const isWide = () => window.innerWidth >= 1100

export default function DiscoverPage() {
  const { data: sources } = useLoad(() => api(ListJobSources()), [])
  const [query, setQuery] = useState(loadQuery)
  const [firstVisit] = useState(() => !hasSavedQuery())
  const [tab, setTab] = useState<Tab>('inbox')
  const [filter, setFilter] = useState({ query: '', source: '', onlyNew: false })
  const [run, setRun] = useState(() => readSessionValue<app.SearchRun>(LAST_RUN_KEY))
  const [showErrors, setShowErrors] = useState(true)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  type Status = { phase: 'searching'; boards: string[]; done: number; total: number } | { phase: 'scoring'; done: number; total: number }
  const [status, setStatus] = useState<Status | null>(null)
  const [statusError, setStatusError] = useState('')
  const [sort, setSort] = useState(() => readPref(SORT_PREF, 'newest'))
  const [matchFor, setMatchFor] = useState<string | null>(null)
  const { data: appSettings } = useLoad(() => api(GetSettings()), [])
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])

  useEffect(() => {
    const offSearch = EventsOn('search:progress', (p: { done: number; total: number }) =>
      setStatus((s) => (s?.phase === 'searching' ? { ...s, done: p.done, total: p.total } : s)),
    )
    const offMatch = EventsOn('match:progress', (p: { done: number; total: number }) => {
      setStatus({ phase: 'scoring', done: p.done, total: p.total })
      notifyDataChanged() // badges fill in request by request
    })
    return () => {
      offSearch()
      offMatch()
    }
  }, [])

  const { data: postings } = useLoad(
    () => api(ListPostings({ tab, query: filter.query, source: filter.source, onlyNew: tab === 'inbox' && filter.onlyNew })),
    [tab, filter.query, filter.source, filter.onlyNew],
  )
  const { data: counts } = useLoad(() => api(InboxCounts()), [])
  const { data: recent } = useLoad(() => api(ListRecentSearches()), [])

  useEffect(() => {
    if (sources && firstVisit) setQuery((q) => (q.sources.length ? q : { ...q, sources: defaultSourceIds(sources) }))
  }, [sources, firstVisit])

  // Not saved until the boards load, so a first visit doesn't store an empty board list.
  useEffect(() => {
    if (sources) writePref(QUERY_PREF, JSON.stringify(query))
  }, [query, sources])

  const shown = useMemo(() => (sort === 'match' && postings ? sortByMatch(postings) : postings), [postings, sort])
  const selected = useMemo(() => shown?.find((p) => p.id === selectedId), [shown, selectedId])
  const matchPosting = shown?.find((p) => p.id === matchFor && p.match)

  const score = async (call: () => Promise<app.MatchRun>) => {
    setStatusError('')
    setStatus({ phase: 'scoring', done: 0, total: 0 })
    const r = await api(call())
    setStatus(null)
    notifyDataChanged()
    if (r?.error) setStatusError(r.error)
  }

  const search = async (call: SearchCall, q: app.SearchQuery = query) => {
    setSearching(true)
    setShowErrors(true)
    setStatusError('')
    const ready = q.sources.filter((id) => sources?.some((s) => s.id === id && !s.unavailable))
    setStatus({ phase: 'searching', boards: ready.map((id) => sourceLabel(sources ?? [], id)), done: 0, total: ready.length })
    const r = await api(call({ ...q, sources: ready }))
    setSearching(false)
    setStatus(null)
    if (!r) return
    writeSessionValue(LAST_RUN_KEY, r)
    setRun(r)
    setTab('inbox')
    notifyDataChanged()
    if (shouldAutoScore(appSettings)) await score(ScoreInbox)
  }

  const runSaved = (s: app.SavedSearch, call: SearchCall) => {
    const q = { term: s.term, location: s.location, remoteOnly: s.remoteOnly, sources: s.sources, perSource: s.perSource }
    setQuery(q)
    void search(call, q)
  }

  const removeSearch = async (s: app.SavedSearch) => {
    if (await apiOk(DeleteSearch(s.id))) notifyDataChanged()
  }

  const select = (p: app.Posting) => {
    setSelectedId(p.id)
    if (p.state === 'new') void apiOk(MarkPostingSeen(p.id)).then((ok) => ok && notifyDataChanged())
  }

  // After an action the posting usually leaves this tab, so move to the next one.
  const advance = (p: app.Posting) => {
    if (!shown || selectedId !== p.id) return
    const i = shown.findIndex((x) => x.id === p.id)
    const next = shown[i + 1] ?? shown[i - 1]
    setSelectedId(next && isWide() ? next.id : null)
  }

  const actions: PostingActions = {
    save: async (p) => {
      setBusy(true)
      const job = await api(SavePosting(p.id))
      setBusy(false)
      if (!job) return
      if (p.state !== 'saved') advance(p)
      notifyDataChanged()
      toast.success(`Saved ${job.position} at ${job.company} to Interested`)
    },
    dismiss: async (p) => {
      if (!(await apiOk(DismissPosting(p.id)))) return
      advance(p)
      notifyDataChanged()
      toast.info(`Hidden: ${p.title}. Find it under Not interested.`)
    },
    restore: async (p) => {
      if (!(await apiOk(RestorePosting(p.id)))) return
      advance(p)
      notifyDataChanged()
      toast.success('Moved back to the inbox')
    },
  }

  const clearOld = async () => {
    const ok = await confirmDialog({
      title: 'Clear old postings?',
      message: 'Delete postings you marked Not interested more than 90 days ago. If a board still lists them, a future search may bring them back.',
      confirmLabel: 'Clear',
      danger: true,
    })
    if (!ok) return
    const n = await api(ClearDismissed(90))
    if (n === undefined) return
    notifyDataChanged()
    toast.success(n === 0 ? 'Nothing older than 90 days' : `Cleared ${n} posting${n === 1 ? '' : 's'}`)
  }

  const errors = Object.entries(run?.errors ?? {})
  const tabCount: Record<Tab, number | undefined> = { inbox: counts?.inbox, saved: counts?.saved, dismissed: counts?.dismissed }

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <PageTitle title="Discover" subtitle="Every posting your searches find lands in one inbox. Deal with each once." />
      <SearchForm query={query} onChange={setQuery} onSearch={() => search(RunSearch)} onRefresh={() => search(RefreshSearch)} searching={searching} sources={sources ?? []} />
      <RecentSearches
        searches={recent ?? []}
        onRun={(s) => runSaved(s, RunSearch)}
        onRefresh={(s) => runSaved(s, RefreshSearch)}
        onRemove={removeSearch}
      />

      {status ? (
        <p className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
          <LoaderCircle size={12} className="animate-spin" />
          {status.phase === 'searching' ? searchStatus(status.boards, status.done, status.total) : scoringStatus(status.done, status.total)}
        </p>
      ) : statusError ? (
        <p className="flex items-center gap-2 font-mono text-[11px] text-amber-300">
          <TriangleAlert size={12} />
          {statusError}
          <button onClick={() => setStatusError('')} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            <X size={12} />
          </button>
        </p>
      ) : outdatedCount(postings) > 0 ? (
        <button className="self-start font-mono text-[11px] text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={() => score(RescoreOutdated)}>
          Re-score outdated ({outdatedCount(postings)})
        </button>
      ) : appSettings && !appSettings.matchEnabled ? (
        <p className="font-mono text-[11px] text-ink-3">
          Match scores are off.{' '}
          <Link to={settingsLink('matching')} className="text-indigo-300 hover:underline">
            Turn them on in Settings → Job matching
          </Link>
        </p>
      ) : null}

      {run && (
        <p className="font-mono text-[11px] text-ink-3">
          {run.cached
            ? `Showing saved results from ${timeAgo(run.lastRunAt)}, nothing re-scraped. Use Refresh now to check for new postings.`
            : `Fetched ${run.fetched} posting${run.fetched === 1 ? '' : 's'}, ${run.newCount} new.`}
        </p>
      )}

      {showErrors && errors.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-amber-200">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <ul className="min-w-0 flex-1 space-y-0.5">
            {errors.map(([source, message]) => (
              <li key={source} className="break-words">
                <strong>{sourceLabel(sources ?? [], source)}</strong> failed: {message}
              </li>
            ))}
          </ul>
          <button onClick={() => setShowErrors(false)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-white/5 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                setSelectedId(null)
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                tab === t.id ? 'bg-accent/30 text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {t.label}
              {tabCount[t.id] !== undefined && <span className="font-mono text-[10px] text-ink-3">{tabCount[t.id]}</span>}
              {t.id === 'inbox' && (counts?.new ?? 0) > 0 && (
                <span className="rounded-full bg-info/20 px-1.5 font-mono text-[10px] text-cyan-300">{counts?.new} new</span>
              )}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
          <input
            className="field w-48 py-1 pl-7 text-xs"
            placeholder="Filter"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
        </label>
        <select className="field w-auto py-1 text-xs" value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })}>
          <option value="">Any source</option>
          {(sources ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="field w-auto py-1 text-xs"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value)
            writePref(SORT_PREF, e.target.value)
          }}
          aria-label="Sort"
        >
          <option value="newest">Newest</option>
          <option value="match">Best match</option>
        </select>
        {tab === 'inbox' && (
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={filter.onlyNew}
              onChange={(e) => setFilter({ ...filter, onlyNew: e.target.checked })}
            />
            Only new
          </label>
        )}
        {tab === 'dismissed' && (counts?.dismissed ?? 0) > 0 && (
          <button className="ml-auto text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={clearOld}>
            Clear older than 90 days
          </button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-h-0 overflow-y-auto pr-1">
          {!shown ? null : shown.length === 0 ? (
            <EmptyState tab={tab} filtered={!!(filter.query || filter.source || filter.onlyNew)} />
          ) : (
            <PostingList
              postings={shown}
              selectedId={selectedId}
              onSelect={select}
              actions={actions}
              scoring={status?.phase === 'scoring'}
              onOpenMatch={(p) => setMatchFor(p.id)}
              onScore={(p) => void score(() => ScorePosting(p.id))}
            />
          )}
        </div>
        {selected ? (
          <PreviewPane posting={selected} busy={busy} actions={actions} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="glass hidden place-items-center rounded-2xl text-sm text-ink-3 min-[1100px]:grid">
            {postings?.length ? 'Select a posting to preview it' : ''}
          </div>
        )}
      </div>
      {matchPosting?.match && (
        <MatchDialog
          posting={matchPosting}
          match={matchPosting.match}
          providers={providers ?? []}
          onClose={() => setMatchFor(null)}
          onRescore={() => void score(() => ScorePosting(matchPosting.id))}
        />
      )}
    </div>
  )
}

function EmptyState({ tab, filtered }: { tab: Tab; filtered: boolean }) {
  const text = filtered
    ? 'Nothing matches these filters.'
    : tab === 'inbox'
      ? 'Your inbox is empty. Run a search to pull in postings.'
      : tab === 'saved'
        ? 'Postings you add to Interested show up here.'
        : 'Postings you mark Not interested are kept here, so they never come back.'
  const Icon = tab === 'inbox' ? Inbox : Telescope
  return (
    <div className="grid h-full min-h-48 place-items-center rounded-2xl border border-dashed border-line p-8 text-center">
      <div>
        <Icon size={28} className="mx-auto mb-3 text-ink-3" />
        <p className="text-sm text-ink-2">{text}</p>
      </div>
    </div>
  )
}
