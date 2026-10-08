// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Field } from '../../components/JobForm'
import { api } from '../../lib/api'
import { ListAIProviders, type settings } from '../../lib/backend'
import { useLoad } from '../../lib/useLoad'
import { Section } from './Section'

const WORK_MODES = [
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'onsite', label: 'On-site' },
]
const SENIORITY = ['entry', 'mid', 'senior', 'staff', 'principal', 'manager']

type Props = { s: settings.Settings; setS: (s: settings.Settings) => void }

/** Discover match scores: the switch, who grades, request size, and what "a good match" means to you. */
export function JobMatchingSection({ s, setS }: Props) {
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const toggleMode = (id: string) =>
    setS({ ...s, matchWorkModes: s.matchWorkModes.includes(id) ? s.matchWorkModes.filter((m) => m !== id) : [...s.matchWorkModes, id] })

  return (
    <Section
      title="Job matching"
      hint="Grades each Discover posting against your resume and these preferences. Postings go to the AI in groups, so a normal search costs one request."
    >
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-indigo-500" checked={s.matchEnabled} onChange={(e) => setS({ ...s, matchEnabled: e.target.checked })} />
        Score new postings automatically after each search
      </label>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Provider">
          <select className="field" value={s.matchProvider} onChange={(e) => setS({ ...s, matchProvider: e.target.value })} aria-label="Job matching provider">
            {(providers ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.unavailable ? ' (setup needed)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Postings per request (5–50)">
          <input
            className="field"
            type="number"
            min={5}
            max={50}
            value={s.matchPerRequest}
            onChange={(e) => setS({ ...s, matchPerRequest: Number(e.target.value) })}
          />
        </Field>
        <Field label="Salary floor (per year, $)">
          <input
            className="field"
            type="number"
            min={0}
            step={1000}
            value={s.matchMinSalary || ''}
            placeholder="No floor"
            onChange={(e) => setS({ ...s, matchMinSalary: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          />
        </Field>
        <Field label="Target seniority">
          <select className="field" value={s.matchSeniority} onChange={(e) => setS({ ...s, matchSeniority: e.target.value })}>
            <option value="">No target</option>
            {SENIORITY.map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-1.5">
          <span className="label-mono">Work modes</span>
          <div className="flex gap-3 text-sm">
            {WORK_MODES.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-indigo-500" checked={s.matchWorkModes.includes(m.id)} onChange={() => toggleMode(m.id)} />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <Field label="Locations">
          <input className="field" placeholder="e.g. Denver, CO; Boulder, CO" value={s.matchLocations} onChange={(e) => setS({ ...s, matchLocations: e.target.value })} />
        </Field>
        <Field label="Goals and deal-breakers" wide>
          <textarea
            className="field min-h-20"
            placeholder="e.g. Climate or health tech preferred. No on-call. No defense work."
            value={s.matchGoals}
            onChange={(e) => setS({ ...s, matchGoals: e.target.value })}
          />
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Changing your resume or these preferences marks existing scores outdated; re-score them from Discover when you're ready. Nothing is re-graded on its own.
      </p>
    </Section>
  )
}
