// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { Sparkles, ThumbsUp, Trash2 } from 'lucide-react'
import { Chip } from '../../components/Chip'
import { Panel } from '../../components/Panel'
import type { main, ai } from '../../lib/backend'
import { attachTips, clock, SCORE_DIMENSIONS } from '../../lib/interview'

/** "Gemini Live · gemini-3.8-live" for a scorecard tab. */
export function cardLabel(card: main.ScorecardResult, providers: ai.AIProvider[] | undefined): string {
  const name = providers?.find((p) => p.id === card.provider)?.label ?? card.provider
  return card.model ? `${name} · ${card.model}` : name
}

/** The id ScorecardTabs uses for the plan tab (provider ids never clash with it). */
export const PLAN_TAB = 'plan'

export function ScorecardTabs({
  cards,
  selected,
  providers,
  hasPlan = false,
  onSelect,
  onDelete,
}: {
  cards: main.ScorecardResult[]
  selected: string
  providers: ai.AIProvider[] | undefined
  hasPlan?: boolean
  onSelect: (tab: string) => void
  onDelete: (provider: string) => void
}) {
  const tabs = cards.map((c) => ({ id: c.provider, label: cardLabel(c, providers) }))
  if (hasPlan) tabs.push({ id: PLAN_TAB, label: 'Plan' })
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.length > 1 && (
        <div className="flex flex-wrap rounded-lg border border-line bg-white/5 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${t.id === selected ? 'bg-accent/30 text-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {cards.length === 1 && tabs.length === 1 && <span className="font-mono text-[11px] text-ink-3">Graded by {cardLabel(cards[0], providers)}</span>}
      {selected !== PLAN_TAB && cards.length > 0 && (
        <button className="ml-auto flex items-center gap-1 text-xs text-ink-3 hover:text-danger" onClick={() => onDelete(selected)}>
          <Trash2 size={12} /> Delete this scorecard
        </button>
      )}
    </div>
  )
}

export function ScorecardView({ card }: { card: main.Scorecard }) {
  return (
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

function TipLine({ tip }: { tip: main.InterviewTip }) {
  return (
    <p className="flex items-start gap-2 text-xs text-ink-2">
      {tip.kind === 'good' ? <ThumbsUp size={12} className="mt-0.5 shrink-0 text-success" /> : <Sparkles size={12} className="mt-0.5 shrink-0 text-info" />}
      {tip.text}
    </p>
  )
}

/** The transcript with each saved coaching tip under the answer it was about; click a line to play from there. */
export function TranscriptWithTips({
  lines,
  tips,
  canPlay,
  onSeek,
}: {
  lines: main.TranscriptLine[]
  tips: main.InterviewTip[]
  canPlay: boolean
  onSeek: (ms: number) => void
}) {
  // With no transcript (e.g. the app closed before the first autosave), every tip is "other".
  const { byLine, unmatched } = attachTips(lines, tips)
  return (
    <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
      {lines.length === 0 && <p className="text-xs text-ink-3">Nothing was recorded.</p>}
      <ol className="space-y-2">
        {lines.map((l, i) => (
          <li key={i}>
            <button
              onClick={() => onSeek(l.atMs)}
              disabled={!canPlay}
              className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5 disabled:hover:bg-transparent"
              title={canPlay ? 'Play from here' : undefined}
            >
              <span className="mt-0.5 w-10 shrink-0 font-mono text-[10px] text-ink-3">{clock(l.atMs)}</span>
              <span className={`text-sm ${l.speaker === 'you' ? 'text-ink' : 'text-ink-2'}`}>
                <strong className={l.speaker === 'you' ? 'text-indigo-200' : 'text-ink-3'}>{l.speaker === 'you' ? 'You' : 'Interviewer'}:</strong> {l.text}
              </span>
            </button>
            {byLine.get(i)?.map((t, j) => (
              <div key={j} className="ml-[3.25rem] mt-1 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5">
                <TipLine tip={t} />
              </div>
            ))}
          </li>
        ))}
      </ol>
      {unmatched.length > 0 && (
        <div className="border-t border-line pt-2">
          <p className="label-mono mb-1">Other tips</p>
          <div className="space-y-1">
            {unmatched.map((t, j) => (
              <TipLine key={j} tip={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
