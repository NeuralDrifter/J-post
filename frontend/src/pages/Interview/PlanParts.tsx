// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Panel } from '../../components/Panel'
import type { main } from '../../lib/backend'
import { formatDate } from '../../lib/format'
import { averageScore, SCORE_DIMENSIONS } from '../../lib/interview'
import { attemptLabel, compareAttempts } from '../../lib/plans'

/** The question plan the interviewer was given, shown only after the interview. */
export function PlanView({ record, providers }: { record: main.InterviewPlanRecord; providers?: main.AIProvider[] }) {
  const name = providers?.find((p) => p.id === record.provider)?.label ?? record.provider
  return (
    <>
      <p className="font-mono text-[11px] text-ink-3">
        Planned by {name}
        {record.model && ` · ${record.model}`}
      </p>
      {record.plan.questions.map((q, i) => (
        <Panel key={i} title={`Planned question ${i + 1}`}>
          <p className="text-sm font-semibold">{q.question}</p>
          <p className="mt-1 text-xs text-ink-3">
            Tests {q.tests} · about {q.minutes} min
          </p>
          <p className="label-mono mt-3 mb-1">Follow-up probes</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {q.probes.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
          <p className="label-mono mt-3 mb-1">A strong answer covers</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {q.strongAnswer.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
        </Panel>
      ))}
      {record.plan.resumeClaims.length > 0 && (
        <Panel title="Resume claims to verify">
          <ul className="space-y-2 text-sm">
            {record.plan.resumeClaims.map((c, i) => (
              <li key={i}>
                <span className="font-semibold">{c.claim}</span> <span className="text-ink-2">— {c.probe}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}

/** "Attempt 2 of 3" and a chip per attempt at the same plan; nothing for a single attempt. */
export function AttemptsStrip({ current, attempts, onOpen }: { current: string; attempts: main.AttemptSummary[]; onOpen: (id: string) => void }) {
  if (attempts.length < 2) return null
  const n = attempts.findIndex((a) => a.id === current) + 1
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] text-ink-2">{attemptLabel(n, attempts.length)}</span>
      {attempts.map((a, i) => {
        const avg = averageScore(a.overall)
        return (
          <button
            key={a.id}
            onClick={() => onOpen(a.id)}
            disabled={a.id === current}
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition ${a.id === current ? 'border-accent/60 bg-accent/20 text-ink' : 'border-line text-ink-2 hover:border-line-strong'}`}
          >
            #{i + 1} · {formatDate(a.startedAt)} · {avg !== undefined ? avg : '—'}
          </button>
        )
      })}
    </div>
  )
}

/** Scores and answers side by side across every attempt at the same plan. */
export function CompareAttempts({ plan, attempts }: { plan: main.InterviewPlan; attempts: main.MockInterview[] }) {
  const { questions, other } = compareAttempts(plan, attempts)
  const label = (id: string) => `Attempt ${attempts.findIndex((a) => a.id === id) + 1}`
  return (
    <Panel title="Compare attempts">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-3">
              <th className="py-1 pr-3 font-normal" />
              {SCORE_DIMENSIONS.map(([key, name]) => (
                <th key={key} className="px-2 py-1 font-normal">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => {
              const overall = a.scorecards[0]?.scorecard.overall
              return (
                <tr key={a.id} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-mono text-ink-2">
                    {label(a.id)} · {formatDate(a.startedAt)}
                  </td>
                  {SCORE_DIMENSIONS.map(([key]) => (
                    <td key={key} className="px-2 py-1.5 font-mono">
                      {overall ? overall[key] : '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-4">
        {questions.map((q, i) => (
          <div key={i}>
            <p className="text-sm font-semibold">{q.question}</p>
            {q.byAttempt.length === 0 && <p className="mt-1 text-xs text-ink-3">Not answered in any graded attempt.</p>}
            <ul className="mt-1 space-y-1.5">
              {q.byAttempt.map((a, j) => (
                <li key={j} className="text-xs">
                  <span className="font-mono text-ink-3">{label(a.attemptId)}:</span> <span className="text-ink-2">{a.answerSummary}</span>
                  {a.improve && <span className="block pl-4 text-amber-200/80">Improve: {a.improve}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {other.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="label-mono mb-1">Other questions</p>
            {other.map((o) => (
              <div key={o.attemptId} className="mt-1 text-xs">
                <span className="font-mono text-ink-3">{label(o.attemptId)}:</span>
                <ul className="list-disc pl-6 text-ink-2">
                  {o.reviews.map((r, j) => (
                    <li key={j}>
                      {r.question} — {r.answerSummary}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
