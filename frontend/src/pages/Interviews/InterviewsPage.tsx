import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AudioLines, FolderOpen, ListChecks, Mic, Repeat, Sparkles, Trash2 } from 'lucide-react'
import { Chip } from '../../components/Chip'
import { confirmDialog } from '../../components/ConfirmDialog'
import { InterviewSetupModal } from '../../components/interview/InterviewSetupModal'
import type { RetryInfo } from '../../components/interview/setupState'
import { PageTitle } from '../../components/PageTitle'
import { api, apiOk } from '../../lib/api'
import { DeleteMockInterview, GetJob, ListAIProviders, ListAllMockInterviews, type main } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { formatDateTime } from '../../lib/format'
import { averageScore, filterByJob } from '../../lib/interview'
import { kindLabel, useInterviewOptions } from '../../lib/interviewOptions'
import { openMenu } from '../../lib/menu'
import { useLoad } from '../../lib/useLoad'

const STATUS_CHIP: Record<string, { label: string; tone: 'info' | 'danger' | 'neutral' }> = {
  live: { label: 'Not finished', tone: 'neutral' },
  scoring: { label: 'Grading…', tone: 'info' },
  failed: { label: 'Grading failed', tone: 'danger' },
  unscored: { label: 'Not scored', tone: 'neutral' },
}

/** Every mock interview across all jobs, so past sessions are easy to find and review. */
export default function InterviewsPage() {
  const navigate = useNavigate()
  const options = useInterviewOptions()
  const { data: interviews } = useLoad(() => api(ListAllMockInterviews()), [])
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const [jobFilter, setJobFilter] = useState('')
  const [retrying, setRetrying] = useState<{ job: main.Job; retry: RetryInfo }>()

  const jobs = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of interviews ?? []) seen.set(m.jobId, `${m.position} · ${m.company}`)
    return [...seen.entries()]
  }, [interviews])
  const shown = filterByJob(interviews ?? [], jobFilter)
  const providerLabel = (id: string) => providers?.find((p) => p.id === id)?.label ?? id

  const remove = async (m: main.MockInterviewSummary) => {
    const ok = await confirmDialog({ title: 'Delete this mock interview?', message: 'The transcript, tips, scorecards and recording will be deleted.', confirmLabel: 'Delete', danger: true })
    if (ok && (await apiOk(DeleteMockInterview(m.id)))) notifyDataChanged()
  }

  const retry = async (m: main.MockInterviewSummary) => {
    const job = await api(GetJob(m.jobId))
    if (job) setRetrying({ job, retry: { id: m.id, kind: m.kind, minutes: m.minutes, startedAt: m.startedAt } })
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Interviews" subtitle="Every mock interview you've done: recordings, tips and scorecards, ready to review." />
      {jobs.length > 1 && (
        <select className="field w-auto py-1 text-xs" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} aria-label="Filter by job">
          <option value="">All jobs</option>
          {jobs.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      )}

      {interviews && shown.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-line p-8 text-center">
          <div>
            <Mic size={28} className="mx-auto mb-3 text-ink-3" />
            <p className="text-sm text-ink-2">No mock interviews yet. Start one from a job's page.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((m) => {
            const avg = averageScore(m.latestOverall)
            const status = STATUS_CHIP[m.status]
            return (
              <li
                key={m.id}
                onContextMenu={(e) =>
                  openMenu(e, [
                    { label: 'Open review', icon: FolderOpen, onSelect: () => navigate(`/interviews/${m.id}`) },
                    ...(m.hasPlan ? [{ label: 'Retry these questions', icon: Repeat, onSelect: () => void retry(m) }] : []),
                    'separator',
                    { label: 'Delete interview', icon: Trash2, danger: true, onSelect: () => void remove(m) },
                  ])
                }
              >
                <button
                  className="glass flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-3 text-left transition hover:border-line-strong"
                  onClick={() => navigate(`/interviews/${m.id}`)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {m.position} · {m.company}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-3">
                      {formatDateTime(m.startedAt)} · {kindLabel(options, m.kind)} · {m.minutes} min
                      {m.interviewerName && ` · with ${m.interviewerName}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {m.attempt > 1 && <Chip tone="info">Attempt {m.attempt}</Chip>}
                    {m.graders.map((g) => (
                      <Chip key={g} tone="accent">
                        {providerLabel(g)}
                      </Chip>
                    ))}
                    {status && <Chip tone={status.tone}>{status.label}</Chip>}
                  </span>
                  <span className="flex items-center gap-2 text-ink-3">
                    {m.hasPlan && <ListChecks size={14} aria-label="Has a question plan" />}
                    {m.hasRecording && <AudioLines size={14} aria-label="Has a recording" />}
                    {m.hasTips && <Sparkles size={14} aria-label="Has coaching tips" />}
                  </span>
                  <span className="w-14 text-right font-mono text-lg font-bold text-indigo-200">{avg !== undefined ? avg : '—'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {retrying && <InterviewSetupModal job={retrying.job} retry={retrying.retry} onClose={() => setRetrying(undefined)} />}
    </div>
  )
}
