// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '../../components/IconButton'
import { api } from '../../lib/api'
import { ListAllInterviews, type app } from '../../lib/backend'
import { addMonths, dayKey, groupByDay, monthGrid } from '../../lib/calendar'
import { exportAllInterviews } from '../../lib/exportFiles'
import { kindLabel, useInterviewOptions } from '../../lib/interviewOptions'
import { useLoad } from '../../lib/useLoad'

const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Every job's interviews on a month calendar; click one to open its job. */
export function InterviewCalendar() {
  const navigate = useNavigate()
  const options = useInterviewOptions()
  const { data: interviews } = useLoad(() => api(ListAllInterviews()), [])
  const [month, setMonth] = useState(() => addMonths(new Date(), 0))
  const byDay = useMemo(() => groupByDay(interviews ?? []), [interviews])
  const today = dayKey(new Date())
  const label = (kind: string) => kindLabel(options, kind)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <IconButton label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeft size={15} />
        </IconButton>
        <h2 className="w-44 text-center text-sm font-semibold">{MONTH.format(month)}</h2>
        <IconButton label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight size={15} />
        </IconButton>
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => setMonth(addMonths(new Date(), 0))}>
          Today
        </button>
        <button type="button" className="btn btn-ghost ml-auto py-1 text-xs" disabled={!interviews?.length} onClick={() => interviews && void exportAllInterviews(interviews, label)}>
          <CalendarArrowDown size={13} /> Export calendar (.ics)
        </button>
      </div>
      <div className="glass overflow-hidden rounded-2xl">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((day) => (
            <span key={day} className="label-mono px-2 py-1.5">
              {day}
            </span>
          ))}
        </div>
        {monthGrid(month).map((week) => (
          <div key={dayKey(week[0]!)} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((day) => (
              <Day
                key={dayKey(day)}
                day={day}
                inMonth={day.getMonth() === month.getMonth()}
                isToday={dayKey(day) === today}
                interviews={byDay.get(dayKey(day)) ?? []}
                label={label}
                onOpen={(iv) => navigate(`/jobs/${iv.jobId}`)}
              />
            ))}
          </div>
        ))}
      </div>
      {interviews?.length === 0 && <p className="text-xs text-ink-3">No interviews scheduled yet. Add them from a job's page.</p>}
    </div>
  )
}

type DayProps = { day: Date; inMonth: boolean; isToday: boolean; interviews: app.ScheduledInterview[]; label: (kind: string) => string; onOpen: (iv: app.ScheduledInterview) => void }

function Day({ day, inMonth, isToday, interviews, label, onOpen }: DayProps) {
  return (
    <div className={`min-h-24 space-y-1 border-r border-line p-1.5 last:border-r-0 ${inMonth ? '' : 'bg-black/20 opacity-60'}`}>
      <span className={`inline-grid size-5 place-items-center rounded-full font-mono text-[11px] ${isToday ? 'bg-accent text-white' : 'text-ink-3'}`}>{day.getDate()}</span>
      {interviews.map((iv) => (
        <button
          key={iv.id}
          type="button"
          onClick={() => onOpen(iv)}
          title={`${label(iv.kind)} · ${iv.position} at ${iv.company}${iv.locationOrLink ? ` · ${iv.locationOrLink}` : ''}`}
          className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] transition hover:brightness-125 ${iv.completed || iv.jobStatus === 'closed' ? 'bg-white/5 text-ink-3 line-through' : 'bg-accent/20 text-indigo-100'}`}
        >
          <span className="font-mono">{TIME.format(new Date(iv.scheduledAt))}</span> {iv.company}
        </button>
      ))}
    </div>
  )
}
