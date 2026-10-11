// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { lazy, Suspense, useState } from 'react'
import { LoaderCircle, ScanText } from 'lucide-react'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import { GetAtsReport, GetSettings, ListAttachments, ListDocuments, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { timeAgo } from '../../lib/format'
import { atsSources, parseStoredReport, runAtsCheck } from '../../lib/resumes/atsCheck'
import { RESUME_KIND } from '../../lib/resumes/paths'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

// Loaded once there's a report to show: it carries the findings' wording.
const AtsReportView = lazy(() => import('../../components/AtsReportView'))

/** Checks how applicant tracking systems read the resume for this job, against its description. */
export function AtsCheckPanel({ job }: { job: app.Job }) {
  const { data: stored } = useLoad(() => api(GetAtsReport(job.id)), [job.id])
  const { data: resumes } = useLoad(() => api(ListDocuments(RESUME_KIND, false)), [])
  const { data: files } = useLoad(() => api(ListAttachments(job.id)), [job.id])
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const sources = atsSources({ linkedResumeId: job.resumeId, defaultResumeId: settings?.defaultResumeId ?? '', resumes: resumes ?? [], files: files ?? [] })
  const [chosen, setChosen] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const source = sources.find((s) => s.id === chosen) ?? sources[0]
  const report = stored ? parseStoredReport(stored.report) : null

  const run = async () => {
    if (!source) return
    setRunning(true)
    try {
      await runAtsCheck(job.id, source, job.description)
      notifyDataChanged()
    } catch (err) {
      toast.error(`The check couldn't run: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Panel title="ATS check">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field min-w-0 flex-1 py-1.5 text-xs" value={source?.id ?? ''} onChange={(e) => setChosen(e.target.value)} disabled={sources.length === 0} aria-label="What to check">
          {sources.length === 0 && <option value="">Add a resume or attach a PDF first</option>}
          {sources.map((s) => (
            <option key={`${s.kind}-${s.id}`} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary py-1.5 text-xs" onClick={run} disabled={!source || running}>
          {running ? <LoaderCircle size={14} className="animate-spin" /> : <ScanText size={14} />} {running ? 'Checking…' : 'Run check'}
        </button>
      </div>
      {!job.description.trim() && <p className="mt-2 text-xs text-ink-3">Add the job description (Edit) to also see which of its keywords the resume covers.</p>}
      {stored && report && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-3 font-mono text-[11px] text-ink-3">
            {stored.source} · checked {timeAgo(stored.checkedAt)}
          </p>
          <Suspense fallback={null}>
            <AtsReportView report={report} />
          </Suspense>
        </div>
      )}
      {!stored && <p className="mt-3 text-xs text-ink-3">Shows how applicant tracking systems read the PDF: whether the text, layout, sections, contact details and dates come through, and what to fix. Everything runs on this computer.</p>}
    </Panel>
  )
}
