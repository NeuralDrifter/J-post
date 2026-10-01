import { LoaderCircle, MapPin, Search } from 'lucide-react'
import type { main } from '../../lib/backend'
import { SOURCE_LABEL } from '../../lib/format'

const JOBSPY_SOURCES = ['indeed', 'linkedin', 'zip_recruiter'] as const

type Props = {
  query: main.DiscoverQuery
  onChange: (q: main.DiscoverQuery) => void
  onSubmit: () => void
  searching: boolean
  adzunaReady: boolean
}

export function SearchForm({ query, onChange, onSubmit, searching, adzunaReady }: Props) {
  const toggle = (source: string) =>
    onChange({
      ...query,
      sources: query.sources.includes(source) ? query.sources.filter((s) => s !== source) : [...query.sources, source],
    })
  const activeSources = query.sources.filter((s) => s !== 'adzuna' || adzunaReady)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
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
        <button className="btn btn-primary min-w-28" disabled={searching || activeSources.length === 0}>
          {searching ? (
            <>
              <LoaderCircle size={15} className="animate-spin" /> Searching…
            </>
          ) : (
            'Search'
          )}
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
        {JOBSPY_SOURCES.map((s) => (
          <label key={s} className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-indigo-500" checked={query.sources.includes(s)} onChange={() => toggle(s)} />
            {SOURCE_LABEL[s]}
          </label>
        ))}
        <label
          className={`flex items-center gap-1.5 ${adzunaReady ? '' : 'opacity-50'}`}
          title={adzunaReady ? undefined : 'Add your Adzuna keys in Settings'}
        >
          <input
            type="checkbox"
            className="accent-indigo-500"
            disabled={!adzunaReady}
            checked={adzunaReady && query.sources.includes('adzuna')}
            onChange={() => toggle('adzuna')}
          />
          Adzuna{!adzunaReady && ' (needs keys)'}
        </label>
        {searching && <span className="ml-auto font-mono text-[11px] text-ink-3">Scraping can take up to a minute…</span>}
      </div>
    </form>
  )
}
