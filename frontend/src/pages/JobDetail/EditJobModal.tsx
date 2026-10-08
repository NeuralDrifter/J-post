// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type FormEvent } from 'react'
import { JobForm } from '../../components/JobForm'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { UpdateJob, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { draftFromJob, jobFromDraft } from '../../lib/jobDraft'

export function EditJobModal({ job, onClose }: { job: app.Job; onClose: () => void }) {
  const [draft, setDraft] = useState(() => draftFromJob(job))
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const updated = await api(UpdateJob(jobFromDraft(draft, job)))
    setSaving(false)
    if (!updated) return
    notifyDataChanged()
    onClose()
  }

  return (
    <Modal title="Edit job" onClose={onClose}>
      <form onSubmit={submit} className="space-y-6">
        <JobForm draft={draft} onChange={setDraft} mode="edit" />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  )
}
