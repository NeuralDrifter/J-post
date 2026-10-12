// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { Loader2, Sparkles } from 'lucide-react'
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
import { useTaskProvider } from './taskProvider'

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
      <TailoredSections />
    </div>
  )
}

type RunProps = { doc: app.Document; data: ResumeData; jobId: string; posting: string; match: JobMatchResult | null }

function TailorRun({ doc, data, jobId, posting, match }: RunProps) {
  const { doc: aiDoc } = useReview<ResumeData>()
  const provider = useTaskProvider(SETTINGS_TASK.tailor)
  const running = useAIReview((s) => s.running[RUN_KEY] ?? false)
  const error = useAIReview((s) => s.errors[RUN_KEY])
  const run = () => {
    if (!match) return
    const material = tailorMaterial(data, aiDoc.passages(data), termsOf(match))
    void useAIReview.getState().run(RUN_KEY, { task: SETTINGS_TASK.tailor, documentId: doc.id, sectionKey: '', jobId, posting: jobId ? '' : posting, ...material } as app.ResumeAIRequest)
  }
  return (
    <div className="space-y-1.5">
      <button type="button" className="btn btn-primary py-1 text-xs" disabled={!posting || !match || running || doc.locked || !!provider.unavailable} onClick={run}>
        {running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {running ? 'Tailoring…' : 'Tailor this resume'}
      </button>
      <p className="text-[11px] text-ink-3">Sends your resume's text, skills and the posting to {provider.label}. Every change waits for you to accept it.</p>
      {provider.unavailable && <p className="text-[11px] text-warn">{provider.unavailable}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
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

/** Sections whose tailored changes are waiting; picking one shows it in the content panel. */
function TailoredSections() {
  const { doc, reviews } = useReview<ResumeData>()
  const data = useEditor((s) => s.data) as ResumeData
  const waiting = reviews.filter((r) => r.shown.gen.task === SETTINGS_TASK.tailor && r.pending > 0)
  if (waiting.length === 0) return null
  return (
    <section className="space-y-1.5">
      <h3 className="label-mono">Changes to review</h3>
      {waiting.map((r) => (
        <button
          key={r.sectionId}
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-white/5"
          onClick={() => document.querySelector(`[data-review="${CSS.escape(r.sectionId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
        >
          {doc.sectionTitle(data, r.sectionId)}
          <span className="text-ink-3">{r.pending}</span>
        </button>
      ))}
    </section>
  )
}
