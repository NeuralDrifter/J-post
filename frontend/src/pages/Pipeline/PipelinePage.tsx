import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PageTitle } from '../../components/PageTitle'
import { useStatusChange } from '../../components/useStatusChange'
import { api } from '../../lib/api'
import { GetMetrics, ListJobSummaries, main } from '../../lib/backend'
import { filterSummaries } from '../../lib/filter'
import type { Status } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { Board } from './Board'
import { MetricsRow } from './MetricsRow'
import { NextUpBanner } from './NextUpBanner'

export default function PipelinePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: summaries, setData } = useLoad(() => api(ListJobSummaries()), [])
  const { data: metrics } = useLoad(() => api(GetMetrics()), [])
  const { request, picker } = useStatusChange()

  const query = params.get('q') ?? ''
  const visible = useMemo(
    () => filterSummaries(summaries ?? [], { query, workMode: '', source: '' }),
    [summaries, query],
  )

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
      <div className="min-h-0 flex-1">
        <Board summaries={visible} onMove={move} onOpen={(id) => navigate(`/jobs/${id}`)} />
      </div>
      {picker}
    </div>
  )
}
