import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const onPipeline = location.pathname === '/'
  const query = onPipeline ? (params.get('q') ?? '') : ''

  // Quick search always filters the pipeline, so typing elsewhere jumps there.
  const setQuery = (value: string) =>
    navigate({ pathname: '/', search: value ? `?q=${encodeURIComponent(value)}` : '' }, { replace: onPipeline })

  return (
    <header className="flex items-center gap-3 border-b border-line bg-base/60 px-4 py-3 backdrop-blur min-[1100px]:px-8">
      <label className="relative ml-auto w-full max-w-sm">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input
          className="field pl-9"
          placeholder="Search company, role, location"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
    </header>
  )
}
