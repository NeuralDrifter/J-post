import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, LoaderCircle, RefreshCw, Repeat, Trash2 } from 'lucide-react'
import { confirmDialog } from '../../components/ConfirmDialog'
import { InterviewSetupModal } from '../../components/interview/InterviewSetupModal'
import { Panel } from '../../components/Panel'
import { api, apiOk } from '../../lib/api'
import {
  DeleteInterviewRecording,
  DeleteMockInterview,
  DeleteScorecard,
  GetInterviewRecording,
  GetJob,
  GetMockInterview,
  ListAIProviders,
  ListPlanAttempts,
  RegradeInterview,
  ScoreInterview,
  type main,
} from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { formatDateTime } from '../../lib/format'
import { averageScore, gradeActions } from '../../lib/interview'
import { kindLabel, useInterviewOptions } from '../../lib/interviewOptions'
import { openMenu } from '../../lib/menu'
import { canRetry } from '../../lib/plans'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { AttemptsStrip, CompareAttempts, PlanView } from './PlanParts'
import { cardLabel, PLAN_TAB, ScorecardTabs, ScorecardView, TranscriptWithTips } from './ReviewParts'

/**
 * The review route: keyed by interview id so moving between attempts (same route,
 * new id) starts from fresh state instead of keeping the last attempt's recording,
 * selected tab or in-flight grading result.
 */
export function InterviewReviewRoute() {
  const { id = '' } = useParams()
  return <InterviewReviewPage key={id} />
}

export default function InterviewReviewPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const options = useInterviewOptions()
  const { data: mi, setData } = useLoad(() => api(GetMockInterview(id)), [id])
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const [scoring, setScoring] = useState(false)
  const [regrading, setRegrading] = useState('')
  const [selected, setSelected] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [retryJob, setRetryJob] = useState<main.Job>()
  // Every attempt at this interview's plan, for the comparison (only fetched when there are several).
  const { data: attemptList } = useLoad(
    () => ((mi?.attempts.length ?? 0) > 1 ? api(ListPlanAttempts(id)) : Promise.resolve(undefined)),
    [id, mi?.attempts.length, mi?.scorecards.length],
  )
  const audio = useRef<HTMLAudioElement>(null)
  const scoredOnce = useRef(false)

  const score = async () => {
    setScoring(true)
    const result = await api(ScoreInterview(id))
    setScoring(false)
    if (result) {
      setData(result)
      setSelected(result.scorecards[0]?.provider ?? '')
    }
    notifyDataChanged()
  }

  // Coming straight from the live page: score once.
  useEffect(() => {
    if (params.get('score') === '1' && mi && !scoredOnce.current && (mi.status === 'live' || mi.status === 'scoring')) {
      scoredOnce.current = true
      setParams({}, { replace: true })
      void score()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mi, params])

  useEffect(() => {
    // An empty answer means the file was gone; the backend cleared it, so refresh.
    if (mi?.hasRecording && !audioUrl) void api(GetInterviewRecording(id)).then((url) => (url ? setAudioUrl(url) : url === '' && notifyDataChanged()))
  }, [mi?.hasRecording, id, audioUrl])

  if (!mi) return <p className="text-sm text-ink-2">Loading…</p>

  const showPlan = !!mi.plan && (selected === PLAN_TAB || mi.scorecards.length === 0)
  const shown = mi.scorecards.find((c) => c.provider === selected) ?? mi.scorecards[0]
  const avg = averageScore(shown?.scorecard.overall)
  const actions = gradeActions(mi.status)

  const regrade = async (provider: string) => {
    setRegrading(provider)
    const result = await api(RegradeInterview(id, provider))
    setRegrading('')
    if (!result) return
    setData(result)
    setSelected(provider)
    notifyDataChanged()
    toast.success('Re-graded')
  }

  const openRegradeMenu = (e: MouseEvent) =>
    openMenu(
      e,
      (providers ?? []).map((p) => ({
        label: p.unavailable ? `${p.label} — ${p.unavailable}` : p.label,
        disabled: !!p.unavailable,
        onSelect: () => void regrade(p.id),
      })),
    )

  const deleteCard = async (provider: string) => {
    const card = mi.scorecards.find((c) => c.provider === provider)
    if (!card) return
    const ok = await confirmDialog({ title: 'Delete this scorecard?', message: `The ${cardLabel(card, providers)} scorecard will be deleted.`, confirmLabel: 'Delete', danger: true })
    if (!ok || !(await apiOk(DeleteScorecard(id, provider)))) return
    setSelected('')
    notifyDataChanged()
  }

  const deleteRecording = async () => {
    const ok = await confirmDialog({ title: 'Delete the recording?', message: 'The audio will be deleted. The transcript, tips and scorecards stay.', confirmLabel: 'Delete', danger: true })
    if (!ok || !(await apiOk(DeleteInterviewRecording(id)))) return
    setAudioUrl('')
    notifyDataChanged()
  }

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Delete this mock interview?', message: 'The transcript, tips, scorecards and recording will be deleted.', confirmLabel: 'Delete', danger: true })
    if (!ok || !(await apiOk(DeleteMockInterview(id)))) return
    navigate(`/jobs/${mi.jobId}`)
    notifyDataChanged()
    toast.success('Mock interview deleted')
  }

  const retry = async () => {
    const job = await api(GetJob(mi.jobId))
    if (job) setRetryJob(job)
  }

  const seek = (ms: number) => {
    if (!audio.current) return
    audio.current.currentTime = ms / 1000
    void audio.current.play()
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-5">
        <button onClick={() => navigate(`/jobs/${mi.jobId}`)} className="mb-3 flex items-center gap-1 font-mono text-[11px] text-ink-2 hover:text-ink">
          <ChevronLeft size={14} /> {mi.company}
        </button>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight">Mock interview review</h1>
            <p className="mt-1 text-sm text-ink-2">
              {mi.position} · {kindLabel(options, mi.kind)} · {mi.minutes} min · {mi.persona}
              {mi.interviewerName && ` · with ${mi.interviewerName} (${mi.voice})`} · {formatDateTime(mi.startedAt)}
            </p>
          </div>
          {avg !== undefined && (
            <div className="font-mono text-3xl font-bold text-indigo-200">
              {avg}
              <span className="text-base text-ink-3"> / 5</span>
            </div>
          )}
          <div className="flex gap-2">
            {canRetry(mi) && (
              <button className="btn btn-ghost" onClick={retry} title="A new attempt with the same planned questions">
                <Repeat size={15} /> Retry these questions
              </button>
            )}
            {actions.gradeNow && (
              <button className="btn btn-ghost" onClick={score} disabled={scoring || !!regrading}>
                <RefreshCw size={15} /> Grade now
              </button>
            )}
            {actions.gradeWith && (
              <button className="btn btn-ghost" onClick={openRegradeMenu} disabled={scoring || !!regrading}>
                {regrading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} {actions.gradeNow ? 'Grade with…' : 'Re-grade with…'}
              </button>
            )}
            <button className="btn btn-danger" onClick={remove} aria-label="Delete interview" title="Delete interview">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <AttemptsStrip current={mi.id} attempts={mi.attempts} onOpen={(other) => navigate(`/interviews/${other}`)} />
        {mi.planError && <p className="mt-3 text-xs text-ink-3">The question plan for this interview couldn't be read.</p>}
        {audioUrl && (
          <div className="mt-4 flex items-center gap-2">
            <audio ref={audio} src={audioUrl} controls className="w-full" />
            <button className="shrink-0 text-xs text-ink-3 hover:text-danger" onClick={deleteRecording} title="Delete the recording only">
              Delete recording
            </button>
          </div>
        )}
      </section>

      {scoring || mi.status === 'scoring' ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle size={16} className="animate-spin" /> Grading the interview… this can take a little while.
        </p>
      ) : mi.status === 'failed' ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-rose-200">Grading failed: {mi.error}</p>
      ) : mi.status === 'unscored' ? (
        <p className="text-sm text-ink-2">Not scored yet. Use Grade now to score it with your grading provider.</p>
      ) : null}
      {regrading && (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle size={16} className="animate-spin" /> Re-grading with {providers?.find((p) => p.id === regrading)?.label ?? regrading}…
        </p>
      )}

      <div className="grid items-start gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {(shown || mi.plan) && (
            <ScorecardTabs
              cards={mi.scorecards}
              selected={showPlan ? PLAN_TAB : (shown?.provider ?? '')}
              providers={providers}
              hasPlan={!!mi.plan}
              onSelect={setSelected}
              onDelete={deleteCard}
            />
          )}
          {showPlan && mi.plan ? <PlanView record={mi.plan} providers={providers} /> : shown && <ScorecardView card={shown.scorecard} />}
          {mi.plan && attemptList && attemptList.length > 1 && <CompareAttempts plan={mi.plan.plan} attempts={attemptList} />}
        </div>
        <Panel title="Transcript" className="min-[1200px]:sticky min-[1200px]:top-0">
          <TranscriptWithTips lines={mi.transcript} tips={mi.tips} canPlay={!!audioUrl} onSeek={seek} />
        </Panel>
      </div>
      {retryJob && (
        <InterviewSetupModal
          job={retryJob}
          retry={{ id: mi.id, kind: mi.kind, minutes: mi.minutes, startedAt: mi.startedAt }}
          onClose={() => setRetryJob(undefined)}
        />
      )}
    </div>
  )
}
