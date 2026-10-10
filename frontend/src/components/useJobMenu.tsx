// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRightLeft, BadgeDollarSign, Copy, ExternalLink, FolderOpen, Mic, Pencil, Receipt, Trash2 } from 'lucide-react'
import { deleteJob } from './deleteActions'
import { InterviewSetupModal } from './interview/InterviewSetupModal'
import { api } from '../lib/api'
import { BrowserOpenURL, NewEstimate, type app, type comp } from '../lib/backend'
import { notifyDataChanged } from '../lib/events'
import { STATUSES, STATUS_LABEL, type Status } from '../lib/format'
import type { MenuEntry } from '../lib/menu'
import { copyText } from './ContextMenu'
import { PackageEditor } from './comp/PackageEditor'
import { useStatusChange } from './useStatusChange'

/**
 * Right-click actions for a job, shared by the board and the table.
 * Render `element` once in the page (status picker + comp editor live there).
 */
export function useJobMenu(move?: (jobId: string, status: Status) => void) {
  const navigate = useNavigate()
  const { request, picker } = useStatusChange()
  const [editor, setEditor] = useState<comp.CompPackage | null>(null)
  const [interviewFor, setInterviewFor] = useState<app.Job | null>(null)

  const addComp = async (job: app.Job, kind: 'estimate' | 'offer') => {
    const draft = await api(NewEstimate(job.id))
    if (draft) setEditor({ ...draft, kind, label: kind === 'offer' ? 'Offer' : 'Estimate' })
  }

  const remove = async (job: app.Job) => {
    if (await deleteJob(job)) notifyDataChanged()
  }

  const menuFor = (job: app.Job): MenuEntry[] => [
    { label: 'Open', icon: FolderOpen, onSelect: () => navigate(`/jobs/${job.id}`) },
    { label: 'Edit', icon: Pencil, onSelect: () => navigate(`/jobs/${job.id}?edit=1`) },
    {
      label: 'Move to',
      icon: ArrowRightLeft,
      submenu: STATUSES.map((s) => ({
        label: s === 'closed' ? 'Closed…' : STATUS_LABEL[s],
        disabled: s === job.status,
        onSelect: () => (move && s !== 'closed' ? move(job.id, s) : request(job, s)),
      })),
    },
    'separator',
    { label: 'Mock interview…', icon: Mic, onSelect: () => setInterviewFor(job) },
    { label: 'Add estimate', icon: Receipt, onSelect: () => addComp(job, 'estimate') },
    { label: 'Add offer', icon: BadgeDollarSign, onSelect: () => addComp(job, 'offer') },
    'separator',
    { label: 'Open posting', icon: ExternalLink, disabled: !job.url, onSelect: () => BrowserOpenURL(job.url) },
    { label: 'Copy company & title', icon: Copy, onSelect: () => copyText(`${job.position} — ${job.company}`) },
    'separator',
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(job) },
  ]

  const element = (
    <>
      {picker}
      {editor && <PackageEditor initial={editor} onClose={() => setEditor(null)} />}
      {interviewFor && <InterviewSetupModal job={interviewFor} onClose={() => setInterviewFor(null)} />}
    </>
  )

  return { menuFor, element }
}
