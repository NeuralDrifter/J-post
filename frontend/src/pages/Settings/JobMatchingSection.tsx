// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Link } from 'react-router'
import { Field } from '../../components/JobForm'
import { api } from '../../lib/api'
import { ListAIProviders, type settings } from '../../lib/backend'
import { settingsLink } from '../../lib/settingsNav'
import { useLoad } from '../../lib/useLoad'
import { Section } from './Section'

const WORK_MODES = [
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'onsite', label: 'On-site' },
]
const SENIORITY = ['entry', 'mid', 'senior', 'staff', 'principal', 'manager']

type Props = { s: settings.Settings; setS: (s: settings.Settings) => void }

/** Discover match scores: the switch, request size, and what "a good match" means to you. The provider is picked in AI providers. */
export function JobMatchingSection({ s, setS }: Props) {
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const provider = providers?.find((p) => p.id === s.matchProvider)
  const toggleMode = (id: string) =>
    setS({ ...s, matchWorkModes: s.matchWorkModes.includes(id) ? s.matchWorkModes.filter((m) => m !== id) : [...s.matchWorkModes, id] })

  return (
    <>
      <Section title="Job matching" hint="Gives every Discover posting a match % against your resume and the preferences below.">
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
            s.matchEnabled ? 'border-success/50 bg-success/10' : 'border-line bg-white/[0.03]'
          }`}
        >
          <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={s.matchEnabled} onChange={(e) => setS({ ...s, matchEnabled: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold">{s.matchEnabled ? 'Scoring is on' : 'Scoring is off'}</span>
            <span className="block text-xs text-ink-2">After each search, score every posting that doesn't have a score yet.</span>
          </span>
        </label>
        <p className="mt-3 text-xs text-ink-2">
          Scored by <strong className="text-ink">{provider?.label ?? s.matchProvider}</strong>
          {provider?.unavailable && <span className="text-amber-300"> (setup needed: {provider.unavailable})</span>}.{' '}
          <Link to={settingsLink('ai')} className="text-indigo-300 hover:underline">
            Change it in AI providers
          </Link>
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-ink-2">Send up to</span>
          <input
            className="field w-20"
            type="number"
            min={5}
            max={50}
            value={s.matchPerRequest}
            onChange={(e) => setS({ ...s, matchPerRequest: Number(e.target.value) })}
            aria-label="Postings per request"
          />
          <span className="text-ink-2">postings per request (5–50). Fewer per request is gentler on slow or small models.</span>
        </div>
      </Section>

      <Section title="What a good match means to you" hint="All optional. Anything left blank simply isn't scored.">
        <div className="grid grid-cols-2 gap-4">
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
    </>
  )
}
