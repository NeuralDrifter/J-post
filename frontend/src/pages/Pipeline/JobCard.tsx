import { BellRing, CalendarClock } from 'lucide-react'
import { Chip } from '../../components/Chip'
import type { main } from '../../lib/backend'
import {
  CLOSE_REASON_LABEL,
  daysLabel,
  formatDateTime,
  formatMoney,
  formatSalary,
  initials,
  INTERVIEW_KIND_LABEL,
  WORK_MODE_LABEL,
} from '../../lib/format'

export function JobCard({ summary, overlay = false }: { summary: main.JobSummary; overlay?: boolean }) {
  const { job } = summary
  // A modeled offer beats the posted range.
  const salary = summary.offerYear1Total ? `${formatMoney(summary.offerYear1Total)} yr-1 total` : formatSalary(job.salaryMin, job.salaryMax)
  const mode = WORK_MODE_LABEL[job.workMode]
  // Skip the work mode when the location already says it (e.g. "Remote · Remote").
  const place = [job.location, mode && mode.toLowerCase() !== job.location.trim().toLowerCase() ? mode : '']
    .filter(Boolean)
    .join(' · ')
  const closed = job.status === 'closed'

  return (
    <article
      className={`glass rounded-xl p-3 transition select-none ${closed ? 'opacity-55' : 'hover:border-line-strong'} ${
        overlay ? 'rotate-2 cursor-grabbing border-accent/50 shadow-2xl shadow-accent/20' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white/5 font-mono text-xs font-bold text-ink-2">
          {initials(job.company)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-ink-2">{job.company}</p>
          <h4 className="text-sm leading-snug font-semibold">{job.position}</h4>
        </div>
      </div>

      {(salary || place || (closed && job.closeReason)) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {salary && <Chip tone="success">{salary}</Chip>}
          {place && <Chip title={place}>{place}</Chip>}
          {closed && job.closeReason && <Chip>{CLOSE_REASON_LABEL[job.closeReason]}</Chip>}
        </div>
      )}

      {summary.nextInterview && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-info/30 bg-info/10 px-2 py-1.5 text-xs text-cyan-200">
          <CalendarClock size={14} className="shrink-0" />
          <span className="truncate">
            {INTERVIEW_KIND_LABEL[summary.nextInterview.kind]} · {formatDateTime(summary.nextInterview.scheduledAt)}
          </span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[11px]">
        <span className={summary.stale ? 'text-warn' : 'text-ink-3'}>{daysLabel(summary.daysInStage)} in stage</span>
        {summary.followUpDue && (
          <span className="flex items-center gap-1 text-warn">
            <BellRing size={12} /> Follow up
          </span>
        )}
      </div>
    </article>
  )
}
