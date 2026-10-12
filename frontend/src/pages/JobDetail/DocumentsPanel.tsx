// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useNavigate } from 'react-router'
import { CopyPlus, FileText, Mail, SquareArrowOutUpRight, type LucideIcon } from 'lucide-react'
import { IconButton } from '../../components/IconButton'
import { Panel } from '../../components/Panel'
import { api, apiOk } from '../../lib/api'
import { GetDocument, GetSettings, LinkJobDocuments, ListDocuments, RestoreDocument, TailorResumeForJob, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { requestNeedsResume } from '../../lib/needsResume'
import { documentPath, LETTER_KIND, RESUME_KIND } from '../../lib/resumes/paths'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

type Slot = { kind: string; label: string; icon: LucideIcon; linkedId: string }

/** The resume and cover letter sent for this job; a resume can be copied and tailored for it. */
export function DocumentsPanel({ job }: { job: app.Job }) {
  const slots: Slot[] = [
    { kind: RESUME_KIND, label: 'Resume', icon: FileText, linkedId: job.resumeId },
    { kind: LETTER_KIND, label: 'Cover letter', icon: Mail, linkedId: job.letterId },
  ]
  const link = async (kind: string, id: string) => {
    const resumeId = kind === RESUME_KIND ? id : job.resumeId
    const letterId = kind === LETTER_KIND ? id : job.letterId
    if (await apiOk(LinkJobDocuments(job.id, resumeId, letterId))) notifyDataChanged()
  }
  return (
    <Panel title="Resume & letter">
      <div className="space-y-3">
        {slots.map((slot) => (
          <DocumentSlot key={slot.kind} job={job} slot={slot} onLink={(id) => link(slot.kind, id)} />
        ))}
      </div>
    </Panel>
  )
}

function DocumentSlot({ job, slot, onLink }: { job: app.Job; slot: Slot; onLink: (id: string) => void }) {
  const navigate = useNavigate()
  const { data: docs } = useLoad(() => api(ListDocuments(slot.kind, false)), [slot.kind])
  const { data: linked } = useLoad(() => (slot.linkedId ? api(GetDocument(slot.linkedId)) : Promise.resolve(null)), [slot.linkedId])
  const trashed = linked?.deletedAt ? linked : null
  const Icon = slot.icon

  return (
    <div className="space-y-1.5">
      <span className="label-mono flex items-center gap-1.5">
        <Icon size={12} /> {slot.label}
      </span>
      <div className="flex items-center gap-1">
        <select className="field min-w-0 flex-1 py-1.5 text-xs" value={slot.linkedId} onChange={(e) => onLink(e.target.value)} aria-label={slot.label}>
          <option value="">None chosen</option>
          {trashed && <option value={trashed.id}>{trashed.name} (in Trash)</option>}
          {docs?.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.name}
            </option>
          ))}
        </select>
        {slot.linkedId && (
          <IconButton label={`Open the ${slot.label.toLowerCase()}`} onClick={() => navigate(documentPath({ id: slot.linkedId, kind: slot.kind }))}>
            <SquareArrowOutUpRight size={14} />
          </IconButton>
        )}
        {slot.kind === RESUME_KIND && <TailorButton job={job} />}
      </div>
      {trashed && (
        <p className="text-[11px] text-warn">
          In Trash.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => restore(trashed.id)}>
            Restore it
          </button>
        </p>
      )}
    </div>
  )
}

async function restore(id: string) {
  if (await apiOk(RestoreDocument(id))) notifyDataChanged()
}

/** Copies the linked resume (or the default) for this job, links the copy and opens it on Tailor with this job chosen. */
function TailorButton({ job }: { job: app.Job }) {
  const navigate = useNavigate()
  const tailor = async () => {
    const sourceId = job.resumeId || (await api(GetSettings()))?.defaultResumeId
    if (!sourceId) {
      requestNeedsResume()
      return
    }
    const copy = await api(TailorResumeForJob(job.id, sourceId))
    if (!copy) return
    notifyDataChanged()
    toast.success(`Made "${copy.name}" for this job`)
    navigate(`${documentPath(copy)}?panel=tailor&job=${encodeURIComponent(job.id)}`)
  }
  return (
    <IconButton label="Tailor a copy for this job" onClick={tailor}>
      <CopyPlus size={14} />
    </IconButton>
  )
}
