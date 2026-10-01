import { LoaderCircle, MapPin, RefreshCw, Search } from 'lucide-react'
import type { main } from '../../lib/backend'
import { SOURCE_LABEL } from '../../lib/format'

export const ALL_SOURCES = ['indeed', 'linkedin', 'zip_recruiter', 'adzuna'] as const
export const DEFAULT_PER_SOURCE = 20

type Props = {
  query: main.SearchQuery
  onChange: (q: main.SearchQuery) => void
  onSearch: (force: boolean) => void
  searching: boolean
  adzunaReady: boolean
}

export function SearchForm({ query, onChange, onSearch, searching, adzunaReady }: Props) {
  const toggle = (source: string) =>
    onChange({
      ...query,
      sources: query.sources.includes(source) ? query.sources.filter((s) => s !== source) : [...query.sources, source],
    })
  const setCount = (source: string, n: number) => onChange({ ...query, perSource: { ...query.perSource, [source]: n } })
  const active = query.sources.filter((s) => s !== 'adzuna' || adzunaReady)
  const linkedInHigh = query.sources.includes('linkedin') && (query.perSource.linkedin ?? DEFAULT_PER_SOURCE) > 25

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(false)
      }}
      className="glass space-y-3 rounded-2xl p-4"
    >
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-[2]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            className="field pl-9"
            required
            placeholder="Job title or keywords"
            value={query.term}
            onChange={(e) => onChange({ ...query, term: e.target.value })}
          />
        </label>
        <label className="relative min-w-40 flex-1">
          <MapPin size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            className="field pl-9"
            placeholder="Location (optional)"
            value={query.location}
            onChange={(e) => onChange({ ...query, location: e.target.value })}
          />
        </label>
        <button className="btn btn-primary min-w-28" disabled={searching || active.length === 0}>
          {searching ? (
            <>
              <LoaderCircle size={15} className="animate-spin" /> Searching…
            </>
          ) : (
            'Search'
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={searching || active.length === 0 || !query.term.trim()}
          onClick={() => onSearch(true)}
          title="Scrape again even if this search ran recently"
        >
          <RefreshCw size={15} /> Refresh now
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={query.remoteOnly}
            onChange={(e) => onChange({ ...query, remoteOnly: e.target.checked })}
          />
          Remote only
        </label>
        <span className="h-4 w-px bg-line" />
        {ALL_SOURCES.map((s) => {
          const disabled = s === 'adzuna' && !adzunaReady
          const checked = !disabled && query.sources.includes(s)
          return (
            <span key={s} className={`flex items-center gap-1.5 ${disabled ? 'opacity-50' : ''}`} title={disabled ? 'Add your Adzuna keys in Settings' : undefined}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-indigo-500" disabled={disabled} checked={checked} onChange={() => toggle(s)} />
                {SOURCE_LABEL[s]}
                {disabled && ' (needs keys)'}
              </label>
              {checked && (
                <input
                  type="number"
                  min={5}
                  max={s === 'adzuna' ? 50 : 100}
                  step={5}
                  value={query.perSource[s] ?? DEFAULT_PER_SOURCE}
                  onChange={(e) => setCount(s, Number(e.target.value) || DEFAULT_PER_SOURCE)}
                  className="field w-16 px-2 py-0.5 text-xs"
                  title={`Results to fetch from ${SOURCE_LABEL[s]}`}
                  aria-label={`Results from ${SOURCE_LABEL[s]}`}
                />
              )}
            </span>
          )
        })}
      </div>
      {linkedInHigh && <p className="text-[11px] text-amber-300/90">LinkedIn often blocks requests above ~25 results.</p>}
    </form>
  )
}
