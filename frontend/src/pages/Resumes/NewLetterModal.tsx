// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type SubmitEvent } from 'react'
import { Field } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { ListDocuments, type app } from '../../lib/backend'
import { createLetter } from '../../lib/resumes/actions'
import { parseStoredResume } from '../../lib/resumes/document'
import { RESUME_KIND } from '../../lib/resumes/paths'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

const BLANK = ''

/** Names a new cover letter and picks the resume whose sender details and design it starts with. */
export function NewLetterModal({ defaultResumeId, onClose, onCreated }: { defaultResumeId: string; onClose: () => void; onCreated: (doc: app.Document) => void }) {
  const { data: resumes } = useLoad(() => api(ListDocuments(RESUME_KIND, false)), [])
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sourceId = chosen ?? (resumes?.some((r) => r.id === defaultResumeId) ? defaultResumeId : (resumes?.[0]?.id ?? BLANK))

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    const source = resumes?.find((r) => r.id === sourceId)
    const parsed = source ? parseStoredResume(source.data) : null
    if (parsed && !parsed.ok) {
      toast.error(`"${source?.name}" can't be read: ${parsed.error}`)
      return
    }
    setBusy(true)
    const doc = await createLetter(name.trim(), parsed?.data ?? null)
    setBusy(false)
    if (doc) onCreated(doc)
  }

  return (
    <Modal title="New cover letter" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme — Staff Engineer" autoFocus required />
        </Field>
        <Field label="Sender details and design from">
          <select className="field" value={sourceId} onChange={(e) => setChosen(e.target.value)}>
            {resumes?.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.name}
                {resume.id === defaultResumeId ? ' (default)' : ''}
              </option>
            ))}
            <option value={BLANK}>Nothing — start blank</option>
          </select>
        </Field>
        <p className="text-xs text-ink-3">The letter keeps its own copy: later changes to the resume don't change it.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create cover letter'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
