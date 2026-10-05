import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { apiOk } from '../../lib/api'
import { NudgeAnswer, SaveInterviewRecording, SaveInterviewTranscript, type main } from '../../lib/backend'
import { releaseSession } from '../../lib/interview'
import { bytesToBase64 } from '../../lib/live/audio'
import type { Line, Speaker } from '../../lib/live/reducer'
import { InterviewSession, type SessionStatus } from '../../lib/live/session'
import type { DeviceChoice } from './DeviceCheck'

export type NudgeItem = { text: string; kind: string; atMs: number }

const CLOCK_TICK_MS = 500
const AUTOSAVE_MS = 30_000 // crash safety: what was said survives a hard quit
const MAX_NUDGES = 6

/** Runs one live interview: the session, its clock, autosave, and saving at the end. */
export function useLiveInterview(id: string, live: main.LiveSession | undefined) {
  const navigate = useNavigate()
  const sessionRef = useRef<InterviewSession | null>(null)
  const [started, setStarted] = useState(false)
  const [status, setStatus] = useState<SessionStatus>('connecting')
  const [detail, setDetail] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [speaking, setSpeaking] = useState<Speaker | null>(null)
  const [muted, setMuted] = useState(false)
  const [nudges, setNudges] = useState<NudgeItem[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [ending, setEnding] = useState(false)
  const [micLevel, setMicLevel] = useState(0)

  useEffect(() => {
    if (!started) return
    const tick = window.setInterval(() => setElapsed(sessionRef.current?.now() ?? 0), CLOCK_TICK_MS)
    const save = window.setInterval(() => {
      const s = sessionRef.current
      // A toast every 30 s would bury the interview; the final save on End still reports failures.
      if (s) void SaveInterviewTranscript(id, toTranscript(s.lines)).catch((err) => console.warn('transcript autosave failed', err))
    }, AUTOSAVE_MS)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(save)
    }
  }, [started, id])

  // Leaving the page mid-interview still saves what was said.
  useEffect(
    () => () => {
      const s = sessionRef.current
      if (s && !s.isEnded) {
        releaseSession(id)
        void s.end().then(({ lines }) => apiOk(SaveInterviewTranscript(id, toTranscript(lines))))
      }
    },
    [id],
  )

  const addNudge = (question: string, answer: string, atMs: number) => {
    NudgeAnswer(question, answer)
      .then((n) => n.nudge && setNudges((list) => [{ text: n.nudge, kind: n.kind, atMs }, ...list].slice(0, MAX_NUDGES)))
      .catch((err) => console.warn('coaching cue failed', err)) // cues are optional; don't interrupt
  }

  const begin = async (devices: DeviceChoice) => {
    if (!live) return
    const session = new InterviewSession(
      { token: live.token, wsUrl: live.wsUrl, setup: live.setup, cues: live.cues, ...devices },
      {
        onLines: setLines,
        onStatus: (s, d) => {
          setStatus(s)
          setDetail(d ?? '')
        },
        onSpeaking: setSpeaking,
        onMicLevel: setMicLevel,
        onAnswerEnded: (e) => addNudge(e.question, e.answer, e.endMs),
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
      await apiOk(SaveInterviewRecording(id, bytesToBase64(bytes)))
    }
    navigate(`/interviews/${id}?score=1`, { replace: true })
  }

  const toggleMute = () => {
    sessionRef.current?.setMuted(!muted)
    setMuted(!muted)
  }

  return { started, status, detail, lines, speaking, muted, nudges, elapsed, ending, micLevel, begin, finish, toggleMute }
}

function toTranscript(lines: Line[]): main.TranscriptLine[] {
  return lines.map((l) => ({ speaker: l.speaker, text: l.text, atMs: Math.round(l.atMs) }))
}
