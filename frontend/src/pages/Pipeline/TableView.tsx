import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { StatusChip } from '../../components/Chip'
import type { main } from '../../lib/backend'
import { sortSummaries, type SortDir, type SortKey } from '../../lib/filter'
import { daysLabel, formatDate, formatSalary } from '../../lib/format'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'position', label: 'Position' },
  { key: 'status', label: 'Status' },
  { key: 'salary', label: 'Salary' },
  { key: 'dateApplied', label: 'Applied' },
  { key: 'daysInStage', label: 'In stage' },
]

export function TableView({ summaries, onOpen }: { summaries: main.JobSummary[]; onOpen: (jobId: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'daysInStage', dir: 'desc' })
  const rows = useMemo(() => sortSummaries(summaries, sort.key, sort.dir), [summaries, sort])

  const toggle = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  return (
    <div className="glass h-full overflow-auto rounded-2xl">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 z-10 bg-raised">
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-4 py-2.5 text-left font-normal">
                <button className="label-mono flex items-center gap-1 hover:text-ink" onClick={() => toggle(c.key)}>
                  {c.label}
                  {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, daysInStage, stale }) => (
            <tr
              key={job.id}
              onClick={() => onOpen(job.id)}
              className={`cursor-pointer border-t border-line transition hover:bg-white/5 ${job.status === 'closed' ? 'opacity-55' : ''}`}
            >
              <td className="px-4 py-2.5 font-semibold">{job.company}</td>
              <td className="px-4 py-2.5 text-ink-2">{job.position}</td>
              <td className="px-4 py-2.5">
                <StatusChip status={job.status} closeReason={job.closeReason} />
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{formatSalary(job.salaryMin, job.salaryMax) || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-ink-2">{job.dateApplied ? formatDate(job.dateApplied) : '—'}</td>
              <td className={`px-4 py-2.5 font-mono text-xs ${stale ? 'text-warn' : 'text-ink-2'}`}>{daysLabel(daysInStage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-10 text-center text-sm text-ink-3">No jobs match.</p>}
    </div>
  )
}
