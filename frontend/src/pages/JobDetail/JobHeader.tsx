// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { ChevronLeft, ExternalLink, MapPin, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Chip } from '../../components/Chip'
import { BrowserOpenURL, type main } from '../../lib/backend'
import { CLOSE_REASON_LABEL, formatDate, formatSalary, initials, labelFor, STATUS_LABEL, STATUSES, WORK_MODE_LABEL } from '../../lib/format'
import { sourceLabel, useJobSources } from '../../lib/jobSources'

type Props = {
  job: main.Job
  onStatus: (status: string) => void
  onEdit: () => void
  onDelete: () => void
}

export function JobHeader({ job, onStatus, onEdit, onDelete }: Props) {
  const navigate = useNavigate()
  const sources = useJobSources()
  const salary = formatSalary(job.salaryMin, job.salaryMax)

  return (
    <section className="glass relative overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      <button
        onClick={() => navigate('/')}
        className="mb-3 flex items-center gap-1 font-mono text-[11px] text-ink-2 hover:text-ink"
      >
        <ChevronLeft size={14} /> Pipeline
      </button>
      <div className="relative flex flex-wrap items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-line bg-white/5 font-mono text-lg font-bold">
          {initials(job.company)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-extrabold tracking-tight">{job.position}</h1>
          <p className="mt-1 text-sm text-ink-2">{job.company}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {salary && <Chip tone="success">{salary}</Chip>}
            {job.location && (
              <Chip>
                <MapPin size={11} />
                {job.location}
              </Chip>
            )}
            {job.workMode && <Chip>{labelFor(WORK_MODE_LABEL, job.workMode)}</Chip>}
            {job.source !== 'manual' && <Chip tone="accent">via {sourceLabel(sources, job.source)}</Chip>}
            {job.dateApplied && <Chip>Applied {formatDate(job.dateApplied)}</Chip>}
            {job.followUpOn && <Chip tone="warn">Follow up {formatDate(job.followUpOn)}</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field w-auto" value={job.status} onChange={(e) => onStatus(e.target.value)} aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
                {s === 'closed' && job.status === 'closed' && job.closeReason ? ` · ${labelFor(CLOSE_REASON_LABEL, job.closeReason)}` : ''}
              </option>
            ))}
          </select>
          {job.url && (
            <button className="btn btn-ghost" onClick={() => BrowserOpenURL(job.url)}>
              <ExternalLink size={15} /> Posting
            </button>
          )}
          <button className="btn btn-ghost" onClick={onEdit}>
            <Pencil size={15} /> Edit
          </button>
          <button className="btn btn-danger" onClick={onDelete} title="Delete job" aria-label="Delete job">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}
