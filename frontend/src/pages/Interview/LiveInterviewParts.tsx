// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from 'react'
import { Eye, EyeOff, LoaderCircle, Mic, MicOff, PhoneOff, Sparkles, ThumbsUp } from 'lucide-react'
import { Chip } from '../../components/Chip'
import { clock } from '../../lib/interview'
import { answerStats, LONG_ANSWER_SECONDS, MANY_FILLERS, PACE_RANGE, type AnswerStats } from '../../lib/live/metrics'
import type { Line, Speaker } from '../../lib/live/reducer'
import type { SessionStatus } from '../../lib/live/session'
import { DeviceCheck, type DeviceChoice } from './DeviceCheck'
import type { NudgeItem } from './useLiveInterview'

const STATUS_TEXT: Record<SessionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  ended: 'Ended',
  error: 'Disconnected',
}

const STATUS_TONE: Record<SessionStatus, 'success' | 'danger' | 'info'> = {
  connecting: 'info',
  live: 'success',
  reconnecting: 'info',
  ended: 'info',
  error: 'danger',
}

const MIC_ACTIVE_LEVEL = 0.15 // above this the mic icon shows you're being heard

export function NotRunning({ onOpenReview }: { onOpenReview: () => void }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="glass max-w-md rounded-2xl p-6 text-center">
        <p className="text-sm text-ink-2">This interview isn't running. It may have ended, or the app was restarted. Anything said so far is saved in the review.</p>
        <button className="btn btn-ghost mt-4" onClick={onOpenReview}>
          Open the review
        </button>
      </div>
    </div>
  )
}

type HeaderProps = {
  title: string
  subtitle: string
  started: boolean
  status: SessionStatus
  muted: boolean
  micLevel: number
  elapsed: number
  totalMs: number
  showCues: boolean
  ending: boolean
  onToggleCues: () => void
  onToggleMute: () => void
  onFinish: () => void
}

export function InterviewHeader(p: HeaderProps) {
  const busy = p.started && (p.status === 'connecting' || p.status === 'reconnecting')
  return (
    <header className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-ink-2">{p.title}</p>
        <p className="truncate text-sm font-semibold">{p.subtitle}</p>
      </div>
      <Chip tone={STATUS_TONE[p.status]}>
        {busy && <LoaderCircle size={11} className="animate-spin" />}
        {p.started ? STATUS_TEXT[p.status] : 'Ready'}
      </Chip>
      {p.started && <MicMeter muted={p.muted} level={p.micLevel} />}
      <span className={`font-mono text-sm ${p.elapsed > p.totalMs ? 'text-warn' : 'text-ink-2'}`}>
        {clock(p.elapsed)} / {clock(p.totalMs)}
      </span>
      <button className="btn btn-ghost py-1.5" onClick={p.onToggleCues} title={p.showCues ? 'Hide coaching cues' : 'Show coaching cues'}>
        {p.showCues ? <EyeOff size={15} /> : <Eye size={15} />} Cues
      </button>
      {p.started && (
        <>
          <button className={`btn py-1.5 ${p.muted ? 'btn-danger' : 'btn-ghost'}`} onClick={p.onToggleMute}>
            {p.muted ? <MicOff size={15} /> : <Mic size={15} />} {p.muted ? 'Muted' : 'Mute'}
          </button>
          <button className="btn btn-danger py-1.5" onClick={p.onFinish} disabled={p.ending}>
            <PhoneOff size={15} /> {p.ending ? 'Saving…' : 'End interview'}
          </button>
        </>
      )}
    </header>
  )
}

function MicMeter({ muted, level }: { muted: boolean; level: number }) {
  let iconColor = 'text-ink-3'
  if (muted) iconColor = 'text-danger'
  else if (level > MIC_ACTIVE_LEVEL) iconColor = 'text-success'
  return (
    <span className="flex items-center gap-1.5" title={muted ? 'Muted' : 'Your microphone level'}>
      <Mic size={13} className={iconColor} />
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
        <span className="block h-full rounded-full bg-success transition-[width] duration-75" style={{ width: muted ? 0 : `${Math.round(level * 100)}%` }} />
      </span>
    </span>
  )
}

export function StartPanel({ devices, onDevicesChange, onStart }: { devices: DeviceChoice; onDevicesChange: (d: DeviceChoice) => void; onStart: () => void }) {
  return (
    <div className="glass grid flex-1 place-items-center rounded-2xl p-8 text-center">
      <div className="flex w-full max-w-lg flex-col items-center space-y-5">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent/20 text-indigo-200 shadow-[0_0_40px_rgb(99_102_241/0.35)]">
          <Mic size={28} />
        </div>
        <p className="text-sm text-ink-2">
          Check your microphone and output, then start. The interviewer will greet you and begin; speak naturally, you can interrupt.
        </p>
        <DeviceCheck onChange={onDevicesChange} />
        <button className="btn btn-primary" onClick={onStart} disabled={!devices.micDeviceId}>
          Start interview
        </button>
      </div>
    </div>
  )
}

export function TranscriptView({ lines }: { lines: Line[] }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Block body: smooth scrollIntoView returns a Promise in current Chromium, which must not become the cleanup.
    void end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lines])
  return (
    <section className="glass min-h-0 overflow-y-auto rounded-2xl p-4">
      {lines.length === 0 && <p className="text-sm text-ink-3">Waiting for the interviewer…</p>}
      <ol className="space-y-3">
        {lines.map((l, i) => {
          const mine = l.speaker === 'you'
          return (
            <li key={i} className={`flex gap-3 ${mine ? 'flex-row-reverse text-right' : ''}`}>
              <span className="mt-1 shrink-0 font-mono text-[10px] text-ink-3">{clock(l.atMs)}</span>
              <p className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${mine ? 'bg-accent/20 text-ink' : 'border border-line bg-white/[0.04] text-ink-2'}`}>
                {l.text}
              </p>
            </li>
          )
        })}
      </ol>
      <div ref={end} />
    </section>
  )
}

export function CoachPanel({ lines, speaking, elapsed, nudges }: { lines: Line[]; speaking: Speaker | null; elapsed: number; nudges: NudgeItem[] }) {
  const last = lines[lines.length - 1]
  const answering = last?.speaker === 'you'
  return (
    <aside className="space-y-3">
      <div className="glass rounded-2xl p-4">
        <p className="label-mono mb-2">Now</p>
        <p className="text-sm">{turnText(speaking, answering)}</p>
        {answering && <AnswerMeters stats={answerStats(last.text, last.atMs, elapsed)} />}
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
  )
}

function turnText(speaking: Speaker | null, answering: boolean): string {
  if (speaking === 'interviewer') return 'Interviewer is speaking…'
  return answering ? 'You are answering' : 'Your turn when ready'
}

function AnswerMeters({ stats }: { stats: AnswerStats }) {
  const offPace = !!stats.wpm && (stats.wpm < PACE_RANGE.slow || stats.wpm > PACE_RANGE.fast)
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono">
      <Meter label="Pace" value={stats.wpm ? `${stats.wpm}` : '—'} unit="wpm" warn={offPace} />
      <Meter label="Fillers" value={String(stats.fillers)} warn={stats.fillers >= MANY_FILLERS} />
      <Meter label="Time" value={clock(stats.seconds * 1000)} warn={stats.seconds > LONG_ANSWER_SECONDS} />
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
