// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { AI_TASK_GROUPS, ANTHROPIC_EFFORTS } from '../../generated/choices'
import { api } from '../../lib/api'
import { ListAIProviders, type ai, type settings } from '../../lib/backend'
import { readPref, writePref } from '../../lib/prefs'
import { settingsLink } from '../../lib/settingsNav'
import { useLoad } from '../../lib/useLoad'
import { changeTaskProvider, groupSummary, providerModel, setGroupProvider, setTaskChoice, tasksIn } from './aiFeatures'
import { Section } from './Section'

type Props = { s: settings.Settings; setS: (s: settings.Settings) => void }

const OPEN_GROUPS_PREF = 'aiFeatures.open'
const GROUP_NOTES: Partial<Record<string, string>> = {
  interviews: 'Tips need a fast provider: Gemini Live answers in about a second. Any interview can be re-graded with another provider from its review page.',
  matching: 'Many postings go in each request, so a provider with a large context works best.',
  resumes: 'Each feature shows what it will send before it runs, and every change is a suggestion you accept or reject.',
}

/** Who runs each AI task, one collapsible card per area of the app. */
export function AIFeaturesSection(props: Props) {
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const [open, setOpen] = useState(() => new Set(readPref(OPEN_GROUPS_PREF, '').split(',').filter(Boolean)))
  const toggle = (group: string) => {
    const next = new Set(open)
    if (!next.delete(group)) next.add(group)
    setOpen(next)
    writePref(OPEN_GROUPS_PREF, [...next].join(','))
  }

  return (
    <Section title="AI features" hint="Pick who runs each AI task. Connect the providers themselves in AI providers.">
      <div className="space-y-2">
        {AI_TASK_GROUPS.map((group) => (
          <TaskGroupCard key={group.id} {...props} group={group} providers={providers ?? []} open={open.has(group.id)} onToggle={() => toggle(group.id)} />
        ))}
      </div>
    </Section>
  )
}

type CardProps = Props & {
  group: (typeof AI_TASK_GROUPS)[number]
  providers: readonly ai.AIProvider[]
  open: boolean
  onToggle: () => void
}

function TaskGroupCard({ s, setS, group, providers, open, onToggle }: CardProps) {
  const summary = groupSummary(s, group.id, providers)
  return (
    <div className="rounded-xl border border-line bg-white/[0.03]">
      <button type="button" className="flex w-full items-center gap-2.5 px-4 py-3 text-left" onClick={onToggle} aria-expanded={open}>
        <ChevronRight size={15} className={`shrink-0 text-ink-3 transition ${open ? 'rotate-90' : ''}`} />
        <span className="w-36 shrink-0 text-sm font-semibold">{group.label}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
          {summary.count} task{summary.count === 1 ? '' : 's'} · {summary.providers}
        </span>
        {summary.problems.length > 0 && (
          <span title={`Needs setup: ${summary.problems.join(', ')}`}>
            <TriangleAlert size={14} className="text-amber-300" aria-label="A provider here needs setup" />
          </span>
        )}
      </button>
      {open && <GroupTasks s={s} setS={setS} group={group.id} providers={providers} problems={summary.problems} />}
    </div>
  )
}

type TasksProps = Props & { group: string; providers: readonly ai.AIProvider[]; problems: string[] }

function GroupTasks({ s, setS, group, providers, problems }: TasksProps) {
  return (
    <div className="space-y-3 border-t border-line px-4 py-3">
      {tasksIn(group).map((task) => (
        <TaskRow key={task.id} s={s} setS={setS} task={task.id} label={task.label} providers={providers} />
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        <select className="field w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && setS(setGroupProvider(s, group, e.target.value))} aria-label="Use one provider for all">
          <option value="">Use one provider for all…</option>
          <ProviderOptions providers={providers} />
        </select>
        {problems.length > 0 && (
          <Link to={settingsLink('ai')} className="text-amber-300 hover:underline">
            Set up the provider for {problems.join(', ')}
          </Link>
        )}
      </div>
      {GROUP_NOTES[group] && <p className="text-[11px] text-ink-3">{GROUP_NOTES[group]}</p>}
    </div>
  )
}

type RowProps = Props & { task: string; label: string; providers: readonly ai.AIProvider[] }

function TaskRow({ s, setS, task, label, providers }: RowProps) {
  const choice = s.aiFeatures[task]
  const fallbackModel = providerModel(s, choice.provider)
  return (
    <div className="grid grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_7rem] items-center gap-2">
      <span className="text-xs text-ink-2">{label}</span>
      <select className="field py-1 text-xs" value={choice.provider} onChange={(e) => setS(changeTaskProvider(s, task, e.target.value))} aria-label={`${label}: provider`}>
        <ProviderOptions providers={providers} />
      </select>
      <input
        className="field py-1 font-mono text-xs"
        value={choice.model}
        onChange={(e) => setS(setTaskChoice(s, task, { model: e.target.value }))}
        placeholder={fallbackModel ? `Default (${fallbackModel})` : 'Provider default'}
        aria-label={`${label}: model`}
      />
      {choice.provider === 'anthropic' ? (
        <select className="field py-1 text-xs" value={choice.effort} onChange={(e) => setS(setTaskChoice(s, task, { effort: e.target.value }))} aria-label={`${label}: effort`}>
          {ANTHROPIC_EFFORTS.map((effort) => (
            <option key={effort} value={effort}>
              Effort: {effort}
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}
    </div>
  )
}

function ProviderOptions({ providers }: { providers: readonly ai.AIProvider[] }) {
  return providers.map((p) => (
    <option key={p.id} value={p.id}>
      {p.label}
      {p.unavailable ? ' (setup needed)' : ''}
    </option>
  ))
}
