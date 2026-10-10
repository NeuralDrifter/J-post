// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Columns3, Download, Rows3 } from 'lucide-react'
import { LabelSelect } from '../../components/LabelSelect'
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
  onExport: () => void
}

export function FilterBar({ view, onViewChange, filters, onChange, shown, total, onExport }: Props) {
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
      <LabelSelect
        className="field w-auto py-1 text-xs"
        labels={WORK_MODE_LABEL}
        empty="Any work mode"
        value={filters.workMode}
        onChange={(workMode) => onChange({ ...filters, workMode })}
      />
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
      <button type="button" className="btn btn-ghost py-1 text-xs" onClick={onExport} disabled={shown === 0} title="Save the jobs shown as a spreadsheet (CSV)">
        <Download size={13} /> Export CSV
      </button>
    </div>
  )
}
