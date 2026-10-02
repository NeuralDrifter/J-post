import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { Chip } from '../../components/Chip'
import { confirmDialog } from '../../components/ConfirmDialog'
import { Panel } from '../../components/Panel'
import { api, apiOk } from '../../lib/api'
import { DeleteMockInterview, GetInterviewRecording, GetMockInterview, ScoreInterview, type main } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { formatDateTime } from '../../lib/format'
import { averageScore, clock, MOCK_KIND_LABEL, SCORE_DIMENSIONS } from '../../lib/interview'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

export default function InterviewReviewPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { data: mi, setData } = useLoad(() => api(GetMockInterview(id)), [id])
  const [scoring, setScoring] = useState(false)
  const [audioUrl, setAudioUrl] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  const scoredOnce = useRef(false)

  const score = async () => {
    setScoring(true)
    const result = await api(ScoreInterview(id))
    setScoring(false)
    if (result) setData(result)
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
    if (mi?.hasRecording && !audioUrl) GetInterviewRecording(id).then(setAudioUrl, () => {})
  }, [mi?.hasRecording, id, audioUrl])

  if (!mi) return <p className="text-sm text-ink-2">Loading…</p>

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Delete this mock interview?', message: 'The transcript, scorecard and recording will be deleted.', confirmLabel: 'Delete', danger: true })
    if (!ok || !(await apiOk(DeleteMockInterview(id)))) return
    navigate(`/jobs/${mi.jobId}`)
    notifyDataChanged()
    toast.success('Mock interview deleted')
  }

  const seek = (ms: number) => {
    if (!audio.current) return
    audio.current.currentTime = ms / 1000
    void audio.current.play()
  }

  const card = mi.scorecard
  const avg = averageScore(card?.overall)

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
              {mi.position} · {MOCK_KIND_LABEL[mi.kind]} · {mi.minutes} min · {mi.persona}
              {mi.interviewerName && ` · with ${mi.interviewerName} (${mi.voice})`} · {formatDateTime(mi.startedAt)}
            </p>
          </div>
          {avg !== undefined && <div className="font-mono text-3xl font-bold text-indigo-200">{avg}<span className="text-base text-ink-3"> / 5</span></div>}
          <div className="flex gap-2">
            {(mi.status === 'failed' || mi.status === 'live' || mi.status === 'done') && (
              <button className="btn btn-ghost" onClick={score} disabled={scoring}>
                <RefreshCw size={15} /> {mi.status === 'done' ? 'Re-score' : 'Score now'}
              </button>
            )}
            <button className="btn btn-danger" onClick={remove} aria-label="Delete" title="Delete">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        {audioUrl && <audio ref={audio} src={audioUrl} controls className="mt-4 w-full" />}
      </section>

      {scoring || mi.status === 'scoring' ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle size={16} className="animate-spin" /> Scoring the interview… this takes a few seconds.
        </p>
      ) : mi.status === 'failed' ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-rose-200">Scoring failed: {mi.error}</p>
      ) : null}

      <div className="grid items-start gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {card && (
            <>
              <Panel title="Scores">
                <div className="space-y-2.5">
                  {SCORE_DIMENSIONS.map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-sm text-ink-2">{label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-linear-to-r from-accent to-info" style={{ width: `${(card.overall[key] / 5) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right font-mono text-sm">{card.overall[key]}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ink-2">{card.summary}</p>
              </Panel>
              <Panel title="Practice next">
                <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                  {card.practiceNext.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </Panel>
              {card.questions.map((q, i) => (
                <QuestionCard key={i} q={q} n={i + 1} />
              ))}
            </>
          )}
        </div>
        <Panel title="Transcript" className="min-[1200px]:sticky min-[1200px]:top-0">
          {mi.transcript.length === 0 ? (
            <p className="text-xs text-ink-3">Nothing was recorded.</p>
          ) : (
            <ol className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {mi.transcript.map((l, i) => (
                <li key={i}>
                  <button
                    onClick={() => seek(l.atMs)}
                    disabled={!audioUrl}
                    className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5 disabled:hover:bg-transparent"
                    title={audioUrl ? 'Play from here' : undefined}
                  >
                    <span className="mt-0.5 w-10 shrink-0 font-mono text-[10px] text-ink-3">{clock(l.atMs)}</span>
                    <span className={`text-sm ${l.speaker === 'you' ? 'text-ink' : 'text-ink-2'}`}>
                      <strong className={l.speaker === 'you' ? 'text-indigo-200' : 'text-ink-3'}>{l.speaker === 'you' ? 'You' : 'Interviewer'}:</strong> {l.text}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  )
}

function QuestionCard({ q, n }: { q: main.QuestionReview; n: number }) {
  const [open, setOpen] = useState(false)
  return (
    <Panel title={`Question ${n}`}>
      <p className="text-sm font-semibold">{q.question}</p>
      <p className="mt-1 text-xs text-ink-3">{q.answerSummary}</p>
      <div className="mt-3 space-y-2 text-sm">
        <p>
          <Chip tone="success">Worked</Chip> <span className="text-ink-2">{q.worked}</span>
        </p>
        <p>
          <Chip tone="warn">Improve</Chip> <span className="text-ink-2">{q.improve}</span>
        </p>
      </div>
      <button className="mt-3 text-xs text-indigo-300 hover:underline" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide stronger answer' : 'Show a stronger answer'}
      </button>
      {open && <p className="mt-2 rounded-xl border border-line bg-white/[0.03] p-3 text-sm leading-relaxed text-ink-2 italic">{q.strongerAnswer}</p>}
    </Panel>
  )
}
