// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Check, ClipboardPaste, Plus } from 'lucide-react'
import { api } from '../../../lib/api'
import { CreateJob, ListJobSummaries, type app } from '../../../lib/backend'
import { notifyDataChanged } from '../../../lib/events'
import { emptyDraft, jobFromDraft } from '../../../lib/jobDraft'
import type { ResumeData } from '../../../lib/resumes/document'
import { toast } from '../../../lib/toast'
import { useLoad } from '../../../lib/useLoad'
import { useEditWithUndo } from '../useEditWithUndo'
import { useBuilderView } from '../viewStore'
import { addSkill, hideTerm, restoreHiddenTerms } from './checkEdits'
import { defaultPostingJobId, jobsWithPostings, loadMatcher, matchPosting, type JobMatchResult, type Matcher, type MatchedTerm } from './jobMatch'

/** The source picker's value for a posting pasted this visit. */
const PASTED = ''

/** Job match: a posting's terms, found and missing in the resume. Not part of the score. */
export function JobMatchTab({ doc, data }: { doc: app.Document; data: ResumeData }) {
  const { data: summaries } = useLoad(() => api(ListJobSummaries()), [])
  const jobs = useMemo(() => jobsWithPostings((summaries ?? []).map((s) => s.job)), [summaries])
  const [picked, setPicked] = useState<string | null>(null)
  const jobId = picked ?? defaultPostingJobId(doc, jobs)
  const pasted = useBuilderView((s) => s.pastedPosting)
  const posting = (jobs.find((job) => job.id === jobId)?.description ?? pasted).trim()
  const result = useJobMatch(posting, data)

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="label-mono">Match against</span>
        <select className="field py-1.5 text-xs" value={jobId} onChange={(e) => setPicked(e.target.value)}>
          <option value={PASTED}>A posting I paste</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.position} · {job.company}
            </option>
          ))}
        </select>
      </label>
      {jobId === PASTED && <PastedPosting resumeId={doc.id} />}
      {posting && <MatchResult result={result} />}
      <HiddenTerms terms={data.metadata.check?.hiddenTerms ?? []} />
    </div>
  )
}

/** The match, once the matcher has loaded; it loads only when there's a posting. */
export function useJobMatch(posting: string, data: ResumeData): JobMatchResult | null {
  const [matcher, setMatcher] = useState<Matcher | null>(null)
  useEffect(() => {
    if (posting && !matcher) loadMatcher().then(setMatcher, () => toast.error("The posting couldn't be read."))
  }, [posting, matcher])
  return useMemo(() => (matcher && posting ? matchPosting(matcher, posting, data) : null), [matcher, posting, data])
}

/** Paste a posting for this visit; once pasted, it can be saved as a job in the pipeline. */
function PastedPosting({ resumeId }: { resumeId: string }) {
  const pasted = useBuilderView((s) => s.pastedPosting)
  const setPasted = useBuilderView((s) => s.setPastedPosting)
  const [draft, setDraft] = useState(pasted)
  if (!pasted) {
    return (
      <div className="space-y-2">
        <textarea className="field min-h-28 resize-y text-xs" placeholder="Paste a job posting…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Job posting" />
        <button type="button" className="btn btn-primary py-1 text-xs" disabled={!draft.trim()} onClick={() => setPasted(draft)}>
          Match this posting
        </button>
      </div>
    )
  }
  return (
    <div className="glass space-y-2 rounded-2xl p-3">
      <div className="flex items-center gap-2.5">
        <ClipboardPaste size={15} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Pasted posting</span>
          <span className="block text-[11px] text-ink-3">For this visit only</span>
        </span>
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => setPasted('')}>
          Clear
        </button>
      </div>
      <SaveAsJob posting={pasted} resumeId={resumeId} onSaved={() => setPasted('')} />
    </div>
  )
}

/** Adds the pasted posting to the pipeline as a job that uses this resume. */
function SaveAsJob({ posting, resumeId, onSaved }: { posting: string; resumeId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [position, setPosition] = useState('')
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => setOpen(true)}>
        <Briefcase size={13} /> Save as a job…
      </button>
    )
  }
  const save = async () => {
    const job = { ...jobFromDraft({ ...emptyDraft(), company, position }), description: posting.trim(), resumeId }
    if (!(await api(CreateJob(job)))) return
    notifyDataChanged()
    toast.success(`${position.trim()} · ${company.trim()} added to your pipeline`)
    onSaved()
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <input className="field py-1.5 text-xs" placeholder="Company" required value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company" />
        <input className="field py-1.5 text-xs" placeholder="Role" required value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Role" />
      </div>
      <div className="flex gap-1.5">
        <button type="submit" className="btn btn-primary py-1 text-xs" disabled={!company.trim() || !position.trim()}>
          Save
        </button>
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function MatchResult({ result }: { result: JobMatchResult | null }) {
  if (!result) return <p className="text-sm text-ink-2">Reading the posting…</p>
  if (result.total === 0) return <p className="text-sm text-ink-2">No terms stood out in this posting.</p>
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="flex items-baseline justify-between gap-2 text-sm font-semibold">
          {result.found.length} of {result.total} posting terms appear
          <span className="text-[11px] font-normal text-ink-3">not scored</span>
        </p>
        <div role="progressbar" aria-label="Posting terms in your resume" aria-valuemin={0} aria-valuemax={result.total} aria-valuenow={result.found.length} className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(result.found.length / result.total) * 100}%` }} />
        </div>
      </div>
      {result.missing.length > 0 && <MissingTerms terms={result.missing} />}
      {result.found.length > 0 && <FoundTerms terms={result.found} />}
    </div>
  )
}

/** Terms the resume doesn't use: add one to Skills if it's true, or hide it. */
function MissingTerms({ terms }: { terms: MatchedTerm[] }) {
  const [openTerm, setOpenTerm] = useState<string | null>(null)
  const editWithUndo = useEditWithUndo()
  const setHighlightTerm = useBuilderView((s) => s.setHighlightTerm)
  const open = terms.find((term) => term.term === openTerm)

  const addToSkills = (term: MatchedTerm) => {
    editWithUndo(addSkill(term.label), `“${term.label}” added to Skills`)
    setOpenTerm(null)
    setHighlightTerm(term.term)
  }
  const hide = (term: MatchedTerm) => {
    editWithUndo(hideTerm(term.term), `“${term.label}” hidden`)
    setOpenTerm(null)
  }

  return (
    <section className="space-y-2">
      <h3 className="label-mono">Not in your resume · add only if true</h3>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((term) => (
          <button
            key={term.term}
            type="button"
            aria-expanded={openTerm === term.term}
            onClick={() => setOpenTerm(openTerm === term.term ? null : term.term)}
            className={`flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-xs font-medium transition ${openTerm === term.term ? 'border-accent bg-accent/15' : 'border-line-strong hover:bg-white/5'}`}
          >
            <Plus size={12} className="text-ink-3" /> {term.label}
          </button>
        ))}
      </div>
      {open && (
        <div className="space-y-2 rounded-xl border border-line bg-raised/80 p-3">
          <p className="text-xs text-ink-2">
            “{open.label}” appears {open.jdCount === 1 ? 'once' : `${open.jdCount}×`} in the posting. If it's part of your experience, add it where it belongs.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn btn-primary py-1 text-xs" onClick={() => addToSkills(open)}>
              <Plus size={13} /> Add to Skills
            </button>
            <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => hide(open)}>
              Not true for me, hide it
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Terms the resume already uses; picking one tints where it appears on the page. */
function FoundTerms({ terms }: { terms: MatchedTerm[] }) {
  const highlightTerm = useBuilderView((s) => s.highlightTerm)
  const setHighlightTerm = useBuilderView((s) => s.setHighlightTerm)
  return (
    <section className="space-y-2">
      <h3 className="label-mono">Already covered · pick one to find it on the page</h3>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((term) => {
          const on = highlightTerm === term.term
          return (
            <button
              key={term.term}
              type="button"
              aria-pressed={on}
              onClick={() => setHighlightTerm(on ? null : term.term)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${on ? 'bg-amber-200 text-amber-950' : 'bg-accent/15 text-indigo-200 hover:bg-accent/25'}`}
            >
              <Check size={12} /> {term.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function HiddenTerms({ terms }: { terms: readonly string[] }) {
  const editWithUndo = useEditWithUndo()
  if (terms.length === 0) return null
  return (
    <p className="text-[11px] text-ink-3">
      Hidden: {terms.join(', ')} ·{' '}
      <button type="button" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink" onClick={() => editWithUndo(restoreHiddenTerms, 'Hidden terms are back')}>
        Show again
      </button>
    </p>
  )
}
