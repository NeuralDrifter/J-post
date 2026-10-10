// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Modal } from '../../components/Modal'
import type { ai, app } from '../../lib/backend'
import { formatDateTime } from '../../lib/format'
import { factorRows, gradedAgainst, matchBand } from '../../lib/match'

const RING: Record<string, string> = { good: 'text-emerald-300', fair: 'text-amber-300', low: 'text-ink-2' }
const BAR: Record<string, string> = { good: 'bg-success', fair: 'bg-warn', low: 'bg-ink-3' }

type Props = {
  posting: app.Posting
  match: app.MatchScore
  providers: ai.AIProvider[]
  resumes: { id: string; name: string }[]
  onClose: () => void
  onRescore: () => void
}

export function MatchDialog({ posting, match: m, providers, resumes, onClose, onRescore }: Props) {
  const provider = providers.find((p) => p.id === m.provider)?.label ?? m.provider
  return (
    <Modal title={`${posting.title}${posting.company ? ` · ${posting.company}` : ''}`} onClose={onClose}>
      <div className="flex items-center gap-4">
        <p className={`font-mono text-5xl font-bold ${RING[matchBand(m.overall)]}`}>{m.overall}%</p>
        <p className="text-sm text-ink-2">How well this job fits your resume and preferences, weighted by the factors below.</p>
      </div>

      {m.outdated && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-amber-200">
          Graded against an older resume or preferences.
          <button className="btn btn-ghost py-1 text-xs" onClick={onRescore}>
            Re-score
          </button>
        </div>
      )}

      <ul className="mt-5 space-y-3">
        {factorRows(m).map((f) => (
          <li key={f.label} className={f.applicable ? '' : 'opacity-50'}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">
                {f.label} <span className="font-mono text-[11px] font-normal text-ink-3">{f.weight}%</span>
              </span>
              <span className="font-mono text-xs text-ink-2">{f.applicable ? f.score : 'not applicable'}</span>
            </div>
            {f.applicable && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${BAR[matchBand(f.score)]}`} style={{ width: `${f.score}%` }} />
              </div>
            )}
            {f.note && <p className="mt-1 text-xs text-ink-3">{f.note}</p>}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <ReasonList title="Strengths" items={m.strengths} />
        <ReasonList title="Gaps" items={m.gaps} />
      </div>

      <p className="mt-5 font-mono text-[11px] text-ink-3">
        Graded against {gradedAgainst(m.resumeId, resumes)} by {m.model || 'an unknown model'} ({provider}), {formatDateTime(m.scoredAt)}
      </p>
    </Modal>
  )
}

function ReasonList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="label-mono mb-1">{title}</p>
      {items.length ? (
        <ul className="list-disc space-y-0.5 pl-4 text-ink-2">
          {items.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3">None noted</p>
      )}
    </div>
  )
}
