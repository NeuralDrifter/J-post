import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../lib/api'
import { CreateJob } from '../lib/backend'
import { notifyDataChanged } from '../lib/events'
import { emptyDraft, jobFromDraft } from '../lib/jobDraft'
import { toast } from '../lib/toast'
import { JobForm } from './JobForm'
import { Modal } from './Modal'

export function QuickAddModal({ onClose, initialStatus }: { onClose: () => void; initialStatus?: string }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => ({
    ...emptyDraft(),
    // Closed needs a reason, so a new job can't start there.
    status: initialStatus && initialStatus !== 'closed' ? initialStatus : 'wishlist',
  }))
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const job = await api(CreateJob(jobFromDraft(draft)))
    setSaving(false)
    if (!job) return
    notifyDataChanged()
    toast.success(`Added ${job.position} at ${job.company}`)
    onClose()
    navigate(`/jobs/${job.id}`)
  }

  return (
    <Modal title="New application" onClose={onClose}>
      <form onSubmit={submit} className="space-y-6">
        <JobForm draft={draft} onChange={setDraft} mode="create" />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            Add application
          </button>
        </div>
      </form>
    </Modal>
  )
}
