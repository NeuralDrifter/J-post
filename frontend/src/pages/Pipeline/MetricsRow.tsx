// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { BellRing, Briefcase, CalendarClock, TrendingUp, type LucideIcon } from 'lucide-react'
import type { main } from '../../lib/backend'
import { percent } from '../../lib/format'

type Card = { label: string; value: string; hint: string; icon: LucideIcon; warn?: boolean }

export function MetricsRow({ metrics }: { metrics?: main.Metrics }) {
  const m = metrics
  const cards: Card[] = [
    { label: 'Active', value: m ? String(m.active) : '—', hint: 'applied, interviewing or offer', icon: Briefcase },
    {
      label: 'Response rate',
      value: percent(m?.responseRate),
      hint: m && m.appliedCount > 0 ? `${m.respondedCount} of ${m.appliedCount} got an interview` : 'no applications yet',
      icon: TrendingUp,
    },
    { label: 'Interviews this week', value: m ? String(m.interviewsThisWeek) : '—', hint: 'Mon – Sun', icon: CalendarClock },
    {
      label: 'Follow-ups due',
      value: m ? String(m.followUpsDue) : '—',
      hint: 'stale or scheduled',
      icon: BellRing,
      warn: (m?.followUpsDue ?? 0) > 0,
    },
  ]
  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map(({ label, value, hint, icon: Icon, warn }) => (
        <div key={label} className="glass relative overflow-hidden rounded-2xl px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="label-mono">{label}</span>
            <Icon size={16} className={warn ? 'text-warn' : 'text-ink-3'} />
          </div>
          <p className={`mt-1 font-mono text-[26px] leading-8 font-bold tracking-tight ${warn ? 'text-warn' : ''}`}>{value}</p>
          <p className="truncate font-mono text-[11px] text-ink-3">{hint}</p>
        </div>
      ))}
    </div>
  )
}
