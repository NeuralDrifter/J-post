// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// What a letter is linked to: the job it's for, and the resume its sender
// details and design can follow.
import type { Draft } from 'immer'
import { api, apiOk } from '../../lib/api'
import { GetDocument, LinkJobDocuments, ListDocuments, ListJobSummaries, SetLetterSource, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { parseStoredResume } from '../../lib/resumes/document'
import { withLinkedStyle, type LetterData, type LetterLinks } from '../../lib/resumes/letter'
import { RESUME_KIND } from '../../lib/resumes/paths'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { Toggle } from '../ResumeBuilder/ui/controls'

type Update = (recipe: (draft: Draft<LetterData>) => void) => void

export const linksOf = (doc: app.Document): LetterLinks => ({ sender: doc.senderLinked, design: doc.designLinked })

/** The resume a letter follows, read: null when it follows none, or that resume can't be read. */
export async function loadSourceResume(doc: app.Document) {
  if (!doc.sourceId) return null
  const source = await api(GetDocument(doc.sourceId))
  const parsed = source && !source.deletedAt ? parseStoredResume(source.data) : null
  return parsed?.ok ? parsed.data : null
}

/** "For" a job: links the letter to it (as the letter sent) and addresses the letter to its company. */
export function JobLink({ doc, update }: { doc: app.Document; update: Update }) {
  const { data: summaries } = useLoad(() => api(ListJobSummaries()), [])
  const jobs = (summaries ?? []).map((s) => s.job)
  const current = jobs.find((job) => job.letterId === doc.id)

  const choose = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId)
    if (!job || !(await apiOk(LinkJobDocuments(job.id, job.resumeId, doc.id)))) return
    update((d) => void (d.recipientCompany = job.company))
    notifyDataChanged()
    toast.success(`Linked to ${job.position} · ${job.company}`)
  }
  return (
    <label className="block space-y-1.5">
      <span className="label-mono">For a job</span>
      <select className="field py-1.5 text-xs" value={current?.id ?? ''} onChange={(e) => void choose(e.target.value)}>
        <option value="" disabled>
          {jobs.length ? 'Choose the job this letter is for…' : 'No jobs in your pipeline yet'}
        </option>
        {jobs.map((job) => (
          <option key={job.id} value={job.id}>
            {job.position} · {job.company}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Which resume the letter follows, and whether its sender details and design come from it. */
export function SourceResume({ doc, letter, update }: { doc: app.Document; letter: LetterData; update: Update }) {
  const { data: resumes } = useLoad(() => api(ListDocuments(RESUME_KIND, false)), [])
  const links = linksOf(doc)

  const follow = async (resumeId: string, next: LetterLinks) => {
    const following = resumeId ? next : { sender: false, design: false }
    if (!(await apiOk(SetLetterSource(doc.id, resumeId, following.sender, following.design)))) return
    const source = await loadSourceResume({ ...doc, sourceId: resumeId })
    if (source) update((d) => void (d.style = withLinkedStyle(letter, source, following).style))
    notifyDataChanged()
  }
  return (
    <div className="space-y-2">
      <label className="block space-y-1.5">
        <span className="label-mono">Follows resume</span>
        <select className="field py-1.5 text-xs" value={doc.sourceId} onChange={(e) => void follow(e.target.value, links)}>
          <option value="">None: the letter keeps its own copy</option>
          {(resumes ?? []).map((resume) => (
            <option key={resume.id} value={resume.id}>
              {resume.name}
            </option>
          ))}
        </select>
      </label>
      {doc.sourceId && (
        <>
          <Toggle label="Sender details come from the resume" hint="Name, contact details and photo" checked={links.sender} onChange={(sender) => void follow(doc.sourceId, { ...links, sender })} />
          <Toggle label="Design comes from the resume" hint="Template, fonts, colours and page" checked={links.design} onChange={(design) => void follow(doc.sourceId, { ...links, design })} />
        </>
      )}
    </div>
  )
}
