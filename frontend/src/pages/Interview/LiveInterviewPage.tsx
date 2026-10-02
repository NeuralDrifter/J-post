import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Eye, EyeOff, LoaderCircle, Mic, MicOff, PhoneOff, Sparkles, ThumbsUp } from 'lucide-react'
import { Chip } from '../../components/Chip'
import { apiOk } from '../../lib/api'
import { NudgeAnswer, SaveInterviewRecording, SaveInterviewTranscript, type main } from '../../lib/backend'
import { bytesToBase64 } from '../../lib/live/audio'
import { answerStats, LONG_ANSWER_SECONDS, PACE_RANGE } from '../../lib/live/metrics'
import type { Line } from '../../lib/live/reducer'
import { InterviewSession, type SessionStatus } from '../../lib/live/session'
import { clock, MOCK_KIND_LABEL, peekSession, releaseSession } from '../../lib/interview'
import { readPref, writePref } from '../../lib/prefs'
import { toast } from '../../lib/toast'

type NudgeItem = { text: string; kind: string; atMs: number }

const STATUS_TEXT: Record<SessionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  ended: 'Ended',
  error: 'Disconnected',
}

export default function LiveInterviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [live] = useState<main.LiveSession | undefined>(() => peekSession(id))
  const sessionRef = useRef<InterviewSession | null>(null)
  const [started, setStarted] = useState(false)
  const [status, setStatus] = useState<SessionStatus>('connecting')
  const [detail, setDetail] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [speaking, setSpeaking] = useState<'interviewer' | 'you' | null>(null)
  const [muted, setMuted] = useState(false)
  const [showCues, setShowCues] = useState(() => readPref('interviewCues', 'true') === 'true')
  const [nudges, setNudges] = useState<NudgeItem[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [ending, setEnding] = useState(false)
  const transcriptEnd = useRef<HTMLDivElement>(null)

  // Clock + periodic transcript save (crash safety).
  useEffect(() => {
    if (!started) return
    const tick = window.setInterval(() => setElapsed(sessionRef.current?.now() ?? 0), 500)
    const save = window.setInterval(() => {
      const s = sessionRef.current
      if (s) void SaveInterviewTranscript(id, toTranscript(s.lines)).catch(() => {})
    }, 30_000)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(save)
    }
  }, [started, id])

  useEffect(() => transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [lines])

  // Leaving the page mid-interview still saves what was said.
  useEffect(
    () => () => {
      const s = sessionRef.current
      if (s && !s.isEnded) {
        releaseSession(id)
        void s.end().then(({ lines }) => SaveInterviewTranscript(id, toTranscript(lines)).catch(() => {}))
      }
    },
    [id],
  )

  if (!live) {
    return (
      <div className="grid h-full place-items-center">
        <div className="glass max-w-md rounded-2xl p-6 text-center">
          <p className="text-sm text-ink-2">This interview isn't running. It may have ended, or the app was restarted. Anything said so far is saved in the review.</p>
          <button className="btn btn-ghost mt-4" onClick={() => navigate(`/interviews/${id}`)}>
            Open the review
          </button>
        </div>
      </div>
    )
  }

  const begin = async () => {
    const session = new InterviewSession(
      { token: live.token, wsUrl: live.wsUrl, setup: live.setup, minutes: live.minutes },
      {
        onLines: setLines,
        onStatus: (s, d) => {
          setStatus(s)
          setDetail(d ?? '')
        },
        onSpeaking: setSpeaking,
        onAnswerEnded: (e) => {
          NudgeAnswer(e.question, e.answer)
            .then((n) => n.nudge && setNudges((list) => [{ text: n.nudge, kind: n.kind, atMs: e.endMs }, ...list].slice(0, 6)))
            .catch(() => {}) // cues are optional
        },
      },
    )
    sessionRef.current = session
    setStarted(true)
    try {
      await session.start()
    } catch (err) {
      setStatus('error')
      setDetail((err as Error).message)
    }
  }

  const finish = async () => {
    const s = sessionRef.current
    if (!s || ending) return
    setEnding(true)
    const { lines, recording } = await s.end()
    sessionRef.current = null
    releaseSession(id)
    await apiOk(SaveInterviewTranscript(id, toTranscript(lines)))
    if (recording) {
      const bytes = new Uint8Array(await recording.arrayBuffer())
      if (!(await apiOk(SaveInterviewRecording(id, bytesToBase64(bytes))))) toast.error('The recording could not be saved')
    }
    navigate(`/interviews/${id}?score=1`, { replace: true })
  }

  const toggleMute = () => {
    sessionRef.current?.setMuted(!muted)
    setMuted(!muted)
  }

  const toggleCues = () => {
    writePref('interviewCues', String(!showCues))
    setShowCues(!showCues)
  }

  const total = live.minutes * 60_000
  const last = lines[lines.length - 1]
  const answer = last?.speaker === 'you' ? answerStats(last.text, last.atMs, elapsed) : undefined

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-4">
      <header className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-ink-2">Mock interview · {MOCK_KIND_LABEL[live.kind]}</p>
          <p className="truncate text-sm font-semibold">
            {live.position} · {live.company}
          </p>
        </div>
        <Chip tone={status === 'live' ? 'success' : status === 'error' ? 'danger' : 'info'}>
          {(status === 'connecting' || status === 'reconnecting') && started && <LoaderCircle size={11} className="animate-spin" />}
          {started ? STATUS_TEXT[status] : 'Ready'}
        </Chip>
        <span className={`font-mono text-sm ${elapsed > total ? 'text-warn' : 'text-ink-2'}`}>
          {clock(elapsed)} / {clock(total)}
        </span>
        <button className="btn btn-ghost py-1.5" onClick={toggleCues} title={showCues ? 'Hide coaching cues' : 'Show coaching cues'}>
          {showCues ? <EyeOff size={15} /> : <Eye size={15} />} Cues
        </button>
        {started && (
          <>
            <button className={`btn py-1.5 ${muted ? 'btn-danger' : 'btn-ghost'}`} onClick={toggleMute}>
              {muted ? <MicOff size={15} /> : <Mic size={15} />} {muted ? 'Muted' : 'Mute'}
            </button>
            <button className="btn btn-danger py-1.5" onClick={finish} disabled={ending}>
              <PhoneOff size={15} /> {ending ? 'Saving…' : 'End interview'}
            </button>
          </>
        )}
      </header>

      {status === 'error' && detail && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-rose-200">{detail}</p>
      )}

      {!started ? (
        <div className="glass grid flex-1 place-items-center rounded-2xl p-8 text-center">
          <div className="max-w-md space-y-4">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent/20 text-indigo-200 shadow-[0_0_40px_rgb(99_102_241/0.35)]">
              <Mic size={28} />
            </div>
            <p className="text-sm text-ink-2">
              The interviewer will greet you and start asking questions. Speak naturally; you can interrupt. Headphones prevent echo.
            </p>
            <button className="btn btn-primary" onClick={begin}>
              Start interview
            </button>
          </div>
        </div>
      ) : (
        <div className={`grid min-h-0 flex-1 gap-4 ${showCues ? 'min-[1100px]:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <section className="glass min-h-0 overflow-y-auto rounded-2xl p-4">
            {lines.length === 0 && <p className="text-sm text-ink-3">Waiting for the interviewer…</p>}
            <ol className="space-y-3">
              {lines.map((l, i) => (
                <li key={i} className={`flex gap-3 ${l.speaker === 'you' ? 'flex-row-reverse text-right' : ''}`}>
                  <span className="mt-1 shrink-0 font-mono text-[10px] text-ink-3">{clock(l.atMs)}</span>
                  <p
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      l.speaker === 'you' ? 'bg-accent/20 text-ink' : 'border border-line bg-white/[0.04] text-ink-2'
                    }`}
                  >
                    {l.text}
                  </p>
                </li>
              ))}
            </ol>
            <div ref={transcriptEnd} />
          </section>

          {showCues && (
            <aside className="space-y-3">
              <div className="glass rounded-2xl p-4">
                <p className="label-mono mb-2">Now</p>
                <p className="text-sm">
                  {speaking === 'interviewer' ? 'Interviewer is speaking…' : last?.speaker === 'you' ? 'You are answering' : 'Your turn when ready'}
                </p>
                {answer && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono">
                    <Meter label="Pace" value={answer.wpm ? `${answer.wpm}` : '—'} unit="wpm" warn={!!answer.wpm && (answer.wpm < PACE_RANGE.slow || answer.wpm > PACE_RANGE.fast)} />
                    <Meter label="Fillers" value={String(answer.fillers)} warn={answer.fillers >= 4} />
                    <Meter label="Time" value={clock(answer.seconds * 1000)} warn={answer.seconds > LONG_ANSWER_SECONDS} />
                  </div>
                )}
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="label-mono mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} /> Coach
                </p>
                {nudges.length === 0 ? (
                  <p className="text-xs text-ink-3">A short tip appears after each answer.</p>
                ) : (
                  <ul className="space-y-2">
                    {nudges.map((n, i) => (
                      <li key={i} className={`flex items-start gap-2 text-sm ${i === 0 ? '' : 'opacity-50'}`}>
                        {n.kind === 'good' ? <ThumbsUp size={14} className="mt-0.5 shrink-0 text-success" /> : <Sparkles size={14} className="mt-0.5 shrink-0 text-info" />}
                        {n.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function Meter({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${warn ? 'border-warn/40 bg-warn/10 text-amber-300' : 'border-line bg-white/[0.03]'}`}>
      <p className="text-base font-bold">{value}</p>
      <p className="text-[9px] tracking-wider text-ink-3 uppercase">
        {label}
        {unit && ` · ${unit}`}
      </p>
    </div>
  )
}

function toTranscript(lines: Line[]): main.TranscriptLine[] {
  return lines.map((l) => ({ speaker: l.speaker, text: l.text, atMs: Math.round(l.atMs) }))
}
