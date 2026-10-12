// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { api } from '../../../lib/api'
import { ListJobSummaries, type app } from '../../../lib/backend'
import type { ResumeData } from '../../../lib/resumes/document'
import { coverageOf, parseTailorTerms, tailorMaterial, termCoverage, type TailorTerms } from '../../../lib/resumes/ai/tailor'
import { SETTINGS_TASK } from '../../../lib/resumes/ai/tasks'
import { useLoad } from '../../../lib/useLoad'
import { useJobMatch } from '../check/JobMatchTab'
import { defaultPostingJobId, jobsWithPostings, type JobMatchResult } from '../check/jobMatch'
import { useEditor } from '../editorContext'
import { useReview } from './ReviewContext'
import { useAIReview } from './reviewStore'
import { latestTailorRun } from './sectionAIMenu'
import { TaskRun, WaitingSections } from './TaskRun'

const RUN_KEY = 'tailor'
const PASTED = ''

const termsOf = (match: JobMatchResult): TailorTerms => ({ found: match.found.map((t) => t.label), missing: match.missing.map((t) => t.label) })

/** Tailor: rewrites the resume toward one posting, as changes to review section by section. */
export function TailorPanel({ doc }: { doc: app.Document }) {
  const data = useEditor((s) => s.data) as ResumeData
  const { data: summaries } = useLoad(() => api(ListJobSummaries()), [])
  const jobs = useMemo(() => jobsWithPostings((summaries ?? []).map((s) => s.job)), [summaries])
  const askedFor = new URLSearchParams(useLocation().search).get('job')
  const [picked, setPicked] = useState<string | null>(askedFor)
  const jobId = picked ?? defaultPostingJobId(doc, jobs)
  const [pasted, setPasted] = useState('')
  const posting = (jobs.find((job) => job.id === jobId)?.description ?? pasted).trim()
  const match = useJobMatch(posting, data)

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="label-mono">Tailor to</span>
        <select className="field py-1.5 text-xs" value={jobId} onChange={(e) => setPicked(e.target.value)}>
          <option value={PASTED}>A posting I paste</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.position} · {job.company}
            </option>
          ))}
        </select>
      </label>
      {jobId === PASTED && (
        <textarea className="field min-h-28 resize-y text-xs" placeholder="Paste a job posting…" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Job posting" />
      )}
      <TailorRun doc={doc} data={data} jobId={jobId} posting={posting} match={match} />
      <Coverage match={match} />
      <WaitingSections task={SETTINGS_TASK.tailor} />
    </div>
  )
}

type RunProps = { doc: app.Document; data: ResumeData; jobId: string; posting: string; match: JobMatchResult | null }

function TailorRun({ doc, data, jobId, posting, match }: RunProps) {
  const { doc: aiDoc } = useReview<ResumeData>()
  const run = () => {
    if (!match) return
    const material = tailorMaterial(data, aiDoc.passages(data), termsOf(match))
    void useAIReview.getState().run(RUN_KEY, { task: SETTINGS_TASK.tailor, documentId: doc.id, sectionKey: '', jobId, posting: jobId ? '' : posting, ...material } as app.ResumeAIRequest)
  }
  return (
    <TaskRun
      task={SETTINGS_TASK.tailor}
      runKey={RUN_KEY}
      label="Tailor this resume"
      busyLabel="Tailoring…"
      sends="your resume's text, skills and the posting"
      disabled={!posting || !match || doc.locked}
      onRun={run}
    />
  )
}

/** The posting's terms the resume covers: when last tailored, and now (after accepted changes). */
function Coverage({ match }: { match: JobMatchResult | null }) {
  const last = latestTailorRun(useAIReview((s) => s.generations))
  if (!match || match.total === 0) return null
  const now = termCoverage(match.found.length, match.total)
  const before = last ? coverageOf(parseTailorTerms(last.context)) : null
  return (
    <p className="text-xs text-ink-2">
      Posting terms covered: {before !== null && <>{before}% before tailoring · </>}
      <span className="font-semibold text-ink">{now}% now</span>
    </p>
  )
}
