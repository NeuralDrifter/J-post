import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { GetMetrics } from '../lib/backend'
import { useLoad } from '../lib/useLoad'
import { QuickAddModal } from './QuickAddModal'

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [adding, setAdding] = useState<{ status?: string } | null>(null)

  // Right-click "New application" / "Add job here" anywhere in the app lands here.
  useEffect(() => {
    const onRequest = (e: Event) => setAdding({ status: (e as CustomEvent<{ status?: string }>).detail?.status })
    window.addEventListener('jobtrack:new-application', onRequest)
    return () => window.removeEventListener('jobtrack:new-application', onRequest)
  }, [])
  const { data: metrics } = useLoad(() => api(GetMetrics()), [])
  const onPipeline = location.pathname === '/'
  const query = onPipeline ? (params.get('q') ?? '') : ''

  // Quick search always filters the pipeline, so typing elsewhere jumps there.
  const setQuery = (value: string) =>
    navigate({ pathname: '/', search: value ? `?q=${encodeURIComponent(value)}` : '' }, { replace: onPipeline })

  return (
    <header className="flex items-center gap-3 border-b border-line bg-base/60 px-4 py-3 backdrop-blur min-[1100px]:px-8">
      {metrics && (
        <div className="hidden items-center gap-2 rounded-full border border-line bg-white/5 px-3 py-1 font-mono text-[11px] text-ink-2 min-[1000px]:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_var(--color-success)]" />
          {metrics.active} active · {metrics.interviewsThisWeek} interview{metrics.interviewsThisWeek === 1 ? '' : 's'} this week
        </div>
      )}
      <label className="relative ml-auto w-full max-w-sm">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input
          className="field pl-9"
          placeholder="Search company, role, location"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button className="btn btn-primary shrink-0" onClick={() => setAdding({})} title="New application">
        <Plus size={16} />
        <span className="hidden min-[1000px]:inline">New Application</span>
      </button>
      {adding && <QuickAddModal initialStatus={adding.status} onClose={() => setAdding(null)} />}
    </header>
  )
}
