import { Columns3, Rows3 } from 'lucide-react'
import { WORK_MODE_LABEL } from '../../lib/format'
import { sourceOptions, useJobSources } from '../../lib/jobSources'

export type PipelineView = 'board' | 'table'
export type PipelineFilters = { workMode: string; source: string }

type Props = {
  view: PipelineView
  onViewChange: (v: PipelineView) => void
  filters: PipelineFilters
  onChange: (f: PipelineFilters) => void
  shown: number
  total: number
}

export function FilterBar({ view, onViewChange, filters, onChange, shown, total }: Props) {
  const sources = useJobSources()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-line bg-white/5 p-0.5">
        {(['board', 'table'] as const).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
              view === v ? 'bg-accent/30 text-ink' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {v === 'board' ? <Columns3 size={14} /> : <Rows3 size={14} />}
            {v === 'board' ? 'Board' : 'Table'}
          </button>
        ))}
      </div>
      <select
        className="field w-auto py-1 text-xs"
        value={filters.workMode}
        onChange={(e) => onChange({ ...filters, workMode: e.target.value })}
      >
        <option value="">Any work mode</option>
        {Object.entries(WORK_MODE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        className="field w-auto py-1 text-xs"
        value={filters.source}
        onChange={(e) => onChange({ ...filters, source: e.target.value })}
      >
        <option value="">Any source</option>
        {sourceOptions(sources).map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      {(filters.workMode || filters.source) && (
        <button className="text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={() => onChange({ workMode: '', source: '' })}>
          Clear
        </button>
      )}
      <span className="ml-auto font-mono text-[11px] text-ink-3">
        {shown === total ? `${total} shown` : `${shown} of ${total} shown`}
      </span>
    </div>
  )
}
