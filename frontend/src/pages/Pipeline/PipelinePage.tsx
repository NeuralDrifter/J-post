import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PageTitle } from '../../components/PageTitle'
import { useStatusChange } from '../../components/useStatusChange'
import { api } from '../../lib/api'
import { GetMetrics, ListJobSummaries, main } from '../../lib/backend'
import { filterSummaries } from '../../lib/filter'
import type { Status } from '../../lib/format'
import { readPref, writePref } from '../../lib/prefs'
import { useLoad } from '../../lib/useLoad'
import { Board } from './Board'
import { FilterBar, type PipelineFilters, type PipelineView } from './FilterBar'
import { MetricsRow } from './MetricsRow'
import { NextUpBanner } from './NextUpBanner'
import { TableView } from './TableView'

export default function PipelinePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: summaries, setData } = useLoad(() => api(ListJobSummaries()), [])
  const { data: metrics } = useLoad(() => api(GetMetrics()), [])
  const { request, picker } = useStatusChange()
  const [filters, setFilters] = useState<PipelineFilters>({ workMode: '', source: '' })
  const [view, setView] = useState<PipelineView>(() => (readPref('pipelineView', 'board') === 'table' ? 'table' : 'board'))
  const changeView = (v: PipelineView) => {
    setView(v)
    writePref('pipelineView', v)
  }

  const query = params.get('q') ?? ''
  const visible = useMemo(
    () => filterSummaries(summaries ?? [], { query, ...filters }),
    [summaries, query, filters],
  )

  const open = (id: string) => navigate(`/jobs/${id}`)

  const move = (jobId: string, status: Status) => {
    const current = summaries?.find((s) => s.job.id === jobId)
    if (!current || !summaries) return
    if (status !== 'closed') {
      // Move the card immediately; the reload after ChangeStatus confirms it.
      setData(
        summaries.map((s) =>
          s.job.id === jobId ? main.JobSummary.createFrom({ ...s, job: { ...s.job, status }, daysInStage: 0, stale: false }) : s,
        ),
      )
    }
    request(current.job, status)
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-4">
      <PageTitle
        title="Pipeline"
        subtitle={summaries ? `${summaries.length} job${summaries.length === 1 ? '' : 's'} tracked` : 'Loading…'}
      />
      <MetricsRow metrics={metrics} />
      <NextUpBanner nextUp={metrics?.nextUp} />
      <FilterBar
        view={view}
        onViewChange={changeView}
        filters={filters}
        onChange={setFilters}
        shown={visible.length}
        total={summaries?.length ?? 0}
      />
      <div className="min-h-0 flex-1">
        {view === 'board' ? (
          <Board summaries={visible} onMove={move} onOpen={open} />
        ) : (
          <TableView summaries={visible} onOpen={open} />
        )}
      </div>
      {picker}
    </div>
  )
}
