// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useRef, type ReactNode } from 'react'
import { ImageDown } from 'lucide-react'
import { PageTitle } from '../../components/PageTitle'
import { api } from '../../lib/api'
import { ListAllStageEvents, ListDocuments, ListJobSummaries } from '../../lib/backend'
import { saveExport } from '../../lib/exportFiles'
import { computeOutcomes, sourceCounts, weeklyApplications, type Outcomes, type ReplyCounts } from '../../lib/insights'
import { sourceLabel, useJobSources } from '../../lib/jobSources'
import { RESUME_KIND } from '../../lib/resumes/paths'
import { svgToPng } from '../../lib/svgPng'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

/** How the search is going: the funnel, replies, tailored resumes, weekly pace and sources. */
export default function InsightsPage() {
  const { data: summaries } = useLoad(() => api(ListJobSummaries()), [])
  const { data: events } = useLoad(() => api(ListAllStageEvents()), [])
  const { data: resumes } = useLoad(() => api(ListDocuments(RESUME_KIND, false)), [])
  const jobs = useMemo(() => (summaries ?? []).map((s) => s.job), [summaries])

  const insights = useMemo(() => {
    if (!summaries || !events || !resumes) return null
    // A tailored resume is a copy made for that job.
    const tailoredFor = new Map(resumes.map((r) => [r.id, r.jobId]))
    const outcomes = computeOutcomes(jobs, events, (job) => tailoredFor.get(job.resumeId) === job.id)
    return { outcomes, weeks: weeklyApplications(jobs, events, new Date()), sources: sourceCounts(jobs) }
  }, [summaries, events, resumes, jobs])

  return (
    <div className="space-y-4">
      <PageTitle title="Insights" subtitle="How far applications get, how quickly people reply, and where your jobs come from." />
      {!insights ? null : insights.outcomes.sent === 0 ? (
        <p className="glass rounded-2xl p-6 text-sm text-ink-2">Once you've sent a few applications, this shows how far they get and how quickly people reply.</p>
      ) : (
        <>
          <Tiles outcomes={insights.outcomes} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Funnel outcomes={insights.outcomes} />
            <Replies outcomes={insights.outcomes} />
            <WeeklyChart weeks={insights.weeks} />
            <Sources sources={insights.sources} />
          </div>
        </>
      )}
    </div>
  )
}

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—')

function Tiles({ outcomes }: { outcomes: Outcomes }) {
  const [, interviewing, offers] = outcomes.funnel
  const tiles = [
    { label: 'Active', value: String(outcomes.active), hint: 'applied, interviewing or offer' },
    { label: 'Sent', value: String(outcomes.sent), hint: 'reached Applied' },
    { label: 'Reply rate', value: percent(outcomes.heardBack, outcomes.sent), hint: `${outcomes.heardBack} heard back` },
    { label: 'Interviews', value: String(interviewing?.reached ?? 0), hint: 'reached Interviewing' },
    { label: 'Offers', value: String(offers?.reached ?? 0), hint: outcomes.closed ? `${outcomes.closed} closed` : 'so far' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="glass rounded-2xl px-4 py-3">
          <span className="label-mono">{tile.label}</span>
          <p className="mt-1 font-mono text-[26px] leading-8 font-bold tracking-tight">{tile.value}</p>
          <p className="truncate font-mono text-[11px] text-ink-3">{tile.hint}</p>
        </div>
      ))}
    </div>
  )
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="glass space-y-3 rounded-2xl p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

// The funnel is an SVG with plain colours, so it exports as a PNG exactly as shown.
const FUNNEL_COLORS = { applied: '#6366f1', interviewing: '#06b6d4', offer: '#10b981' } as const
const FUNNEL_LABELS = { applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer' } as const
const FUNNEL_WIDTH = 520
const ROW_HEIGHT = 44

function Funnel({ outcomes }: { outcomes: Outcomes }) {
  const svg = useRef<SVGSVGElement>(null)
  const most = Math.max(1, ...outcomes.funnel.map((row) => row.reached))
  const height = outcomes.funnel.length * ROW_HEIGHT + 16
  const exportPng = async () => {
    if (!svg.current) return
    try {
      await saveExport('Job search funnel.png', await svgToPng(svg.current))
    } catch (err) {
      toast.error(`The image couldn't be made: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return (
    <Card
      title="How far applications get"
      subtitle="Every application that reached each stage, including ones now closed."
      action={
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => void exportPng()}>
          <ImageDown size={13} /> Export PNG
        </button>
      }
    >
      <svg ref={svg} viewBox={`0 0 ${FUNNEL_WIDTH} ${height}`} className="w-full" role="img" aria-label="Application funnel" fontFamily="sans-serif">
        <rect width={FUNNEL_WIDTH} height={height} fill="#111625" rx="12" />
        {outcomes.funnel.map((row, i) => {
          const barWidth = Math.max(4, (row.reached / most) * (FUNNEL_WIDTH - 200))
          const y = 8 + i * ROW_HEIGHT
          const previous = i === 0 ? outcomes.sent : outcomes.funnel[i - 1]!.reached
          return (
            <g key={row.status}>
              <text x="16" y={y + 26} fill="#f8fafc" fontSize="13">
                {FUNNEL_LABELS[row.status]}
              </text>
              <rect x="120" y={y + 10} width={barWidth} height="22" rx="6" fill={FUNNEL_COLORS[row.status]} />
              <text x={128 + barWidth} y={y + 26} fill="#94a3b8" fontSize="12">
                {row.reached} · {i === 0 ? 'sent' : `${percent(row.reached, previous)} of the stage before`}
              </text>
            </g>
          )
        })}
      </svg>
    </Card>
  )
}

function Replies({ outcomes }: { outcomes: Outcomes }) {
  const days = outcomes.medianDaysToReply
  const sample = outcomes.tailored.sent + outcomes.base.sent
  return (
    <Card title="Replies" subtitle="An interview, an offer or a rejection counts as hearing back.">
      <div className="grid grid-cols-2 gap-3">
        <Stat value={`${outcomes.heardBack} of ${outcomes.sent}`} label="heard back" />
        <Stat value={days === null ? '—' : `${days} day${days === 1 ? '' : 's'}`} label="median to first reply" />
      </div>
      <div className="space-y-2">
        <p className="label-mono">Tailored vs. base resume</p>
        <ReplyBar label="Made for the job" counts={outcomes.tailored} />
        <ReplyBar label="Another resume" counts={outcomes.base} />
        {sample > 0 && sample < 10 && <p className="text-[11px] text-ink-3">Small numbers, but worth noticing.</p>}
      </div>
    </Card>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="font-mono text-xl font-bold">{value}</p>
      <p className="text-[11px] text-ink-3">{label}</p>
    </div>
  )
}

function ReplyBar({ label, counts }: { label: string; counts: ReplyCounts }) {
  const share = counts.sent > 0 ? counts.replied / counts.sent : 0
  return (
    <div className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-xs">
      <span className="text-ink-2">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="font-mono text-ink-3">
        {counts.replied}/{counts.sent} · {percent(counts.replied, counts.sent)}
      </span>
    </div>
  )
}

const WEEK_LABEL = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function WeeklyChart({ weeks }: { weeks: { start: Date; count: number }[] }) {
  const most = Math.max(1, ...weeks.map((w) => w.count))
  return (
    <Card title="Applications over time" subtitle="Sent per week, Monday to Sunday, over the last 8 weeks.">
      <div className="flex h-36 items-end gap-2" role="img" aria-label={weeks.map((w) => `${WEEK_LABEL.format(w.start)}: ${w.count}`).join(', ')}>
        {weeks.map((week) => (
          <div key={week.start.toISOString()} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[10px] text-ink-3">{week.count || ''}</span>
            <div className="w-full rounded-t-md bg-accent/70" style={{ height: `${(week.count / most) * 100}px`, minHeight: week.count ? 4 : 1 }} />
            <span className="text-[10px] text-ink-3">{WEEK_LABEL.format(week.start)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Sources({ sources }: { sources: { source: string; count: number }[] }) {
  const boards = useJobSources()
  const most = Math.max(1, ...sources.map((s) => s.count))
  return (
    <Card title="Where your jobs come from" subtitle="Jobs in your pipeline, by source.">
      <ul className="space-y-1.5">
        {sources.map(({ source, count }) => (
          <li key={source} className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate text-ink-2">{sourceLabel(boards, source)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-info" style={{ width: `${(count / most) * 100}%` }} />
            </span>
            <span className="font-mono text-ink-3">{count}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
