import { useState } from 'react'
import { api } from '../lib/api'
import { ChangeStatus, type main } from '../lib/backend'
import { notifyDataChanged } from '../lib/events'
import { CloseReasonPicker } from './CloseReasonPicker'

/**
 * One path for every status change (board drag, detail select). Closing asks
 * for a reason first. Always re-syncs afterwards, so optimistic UI can't drift.
 */
export function useStatusChange() {
  const [closing, setClosing] = useState<main.Job | null>(null)

  const apply = async (jobId: string, status: string, reason = '', note = '') => {
    await api(ChangeStatus(jobId, status, reason, note))
    notifyDataChanged()
  }

  const request = (job: main.Job, status: string) => {
    if (status === job.status) return
    if (status === 'closed') {
      setClosing(job)
      return
    }
    void apply(job.id, status)
  }

  const picker = closing ? (
    <CloseReasonPicker
      company={closing.company}
      onCancel={() => {
        setClosing(null)
        notifyDataChanged()
      }}
      onPick={(reason, note) => {
        const id = closing.id
        setClosing(null)
        void apply(id, 'closed', reason, note)
      }}
    />
  ) : null

  return { request, picker }
}
