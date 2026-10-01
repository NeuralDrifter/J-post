import { useEffect, useState } from 'react'
import { Telescope, TriangleAlert, X } from 'lucide-react'
import { PageTitle } from '../../components/PageTitle'
import { api } from '../../lib/api'
import { CreateJob, Discover, GetSettings, main } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { SOURCE_LABEL } from '../../lib/format'
import { jobFromResult } from '../../lib/jobDraft'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { PreviewPane } from './PreviewPane'
import { ResultsList } from './ResultsList'
import { SearchForm } from './SearchForm'

type DiscoverState = { query: main.DiscoverQuery; response?: main.DiscoverResponse; selectedKey: string | null }

// Survives navigating away and back, so a slow search isn't lost.
let cache: DiscoverState = {
  query: { term: '', location: '', remoteOnly: false, sources: ['indeed', 'linkedin', 'zip_recruiter'] },
  selectedKey: null,
}

const isWide = () => window.innerWidth >= 1100

export default function DiscoverPage() {
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const adzunaReady = Boolean(settings?.adzunaAppId && settings?.adzunaAppKey)
  const [query, setQuery] = useState(cache.query)
  const [response, setResponse] = useState(cache.response)
  const [selectedKey, setSelectedKey] = useState(cache.selectedKey)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(true)

  useEffect(() => {
    cache = { query, response, selectedKey }
  }, [query, response, selectedKey])

  const search = async () => {
    setSearching(true)
    setShowErrors(true)
    const sources = query.sources.filter((s) => s !== 'adzuna' || adzunaReady)
    const r = await api(Discover({ ...query, sources }))
    setSearching(false)
    if (!r) return
    setResponse(r)
    setSelectedKey(isWide() ? (r.results[0]?.key ?? null) : null)
  }

  const save = async (result: main.DiscoverResult) => {
    setSaving(true)
    const job = await api(CreateJob(jobFromResult(result)))
    setSaving(false)
    if (!job || !response) return
    setResponse(
      main.DiscoverResponse.createFrom({
        ...response,
        results: response.results.map((x) => (x.key === result.key ? { ...x, trackedJobId: job.id, trackedStatus: job.status } : x)),
      }),
    )
    notifyDataChanged()
    toast.success(`Saved ${job.position} at ${job.company} to your Wishlist`)
  }

  const errors = Object.entries(response?.errors ?? {})
  const selected = response?.results.find((r) => r.key === selectedKey)

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-4">
      <PageTitle title="Discover" subtitle="Search Indeed, LinkedIn, ZipRecruiter and Adzuna at once." />
      <SearchForm query={query} onChange={setQuery} onSubmit={search} searching={searching} adzunaReady={adzunaReady} />

      {showErrors && errors.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-amber-200">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <ul className="min-w-0 flex-1 space-y-0.5">
            {errors.map(([source, message]) => (
              <li key={source} className="break-words">
                <strong>{SOURCE_LABEL[source] ?? source}</strong> failed: {message}
              </li>
            ))}
          </ul>
          <button onClick={() => setShowErrors(false)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-h-0 overflow-y-auto pr-1">
          {!response ? (
            <EmptyState text="Search to pull fresh postings from every source into one list." />
          ) : response.results.length === 0 ? (
            <EmptyState text="No results. Try broader keywords or another location." />
          ) : (
            <>
              <p className="mb-2 font-mono text-[11px] text-ink-3">{response.results.length} results</p>
              <ResultsList results={response.results} selectedKey={selectedKey} onSelect={setSelectedKey} onSave={save} />
            </>
          )}
        </div>
        {selected ? (
          <PreviewPane result={selected} saving={saving} onSave={() => save(selected)} onClose={() => setSelectedKey(null)} />
        ) : (
          <div className="glass hidden place-items-center rounded-2xl text-sm text-ink-3 min-[1100px]:grid">
            {response?.results.length ? 'Select a result to preview it' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-full min-h-48 place-items-center rounded-2xl border border-dashed border-line p-8 text-center">
      <div>
        <Telescope size={28} className="mx-auto mb-3 text-ink-3" />
        <p className="text-sm text-ink-2">{text}</p>
      </div>
    </div>
  )
}
