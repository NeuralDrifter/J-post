// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRightLeft, BadgeDollarSign, Copy, ExternalLink, FolderOpen, Mic, Pencil, Receipt, Trash2 } from 'lucide-react'
import { InterviewSetupModal } from './interview/InterviewSetupModal'
import { apiOk, api } from '../lib/api'
import { BrowserOpenURL, DeleteJob, NewEstimate, type main } from '../lib/backend'
import { notifyDataChanged } from '../lib/events'
import { STATUSES, STATUS_LABEL, type Status } from '../lib/format'
import type { MenuEntry } from '../lib/menu'
import { toast } from '../lib/toast'
import { confirmDialog } from './ConfirmDialog'
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
  const [editor, setEditor] = useState<main.CompPackage | null>(null)
  const [interviewFor, setInterviewFor] = useState<main.Job | null>(null)

  const addComp = async (job: main.Job, kind: 'estimate' | 'offer') => {
    const draft = await api(NewEstimate(job.id))
    if (draft) setEditor({ ...draft, kind, label: kind === 'offer' ? 'Offer' : 'Estimate' })
  }

  const remove = async (job: main.Job) => {
    const ok = await confirmDialog({
      title: 'Delete this job?',
      message: `${job.position} at ${job.company} will be permanently deleted, along with its history, contacts, interviews, files and comp packages.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok || !(await apiOk(DeleteJob(job.id)))) return
    notifyDataChanged()
    toast.success('Job deleted')
  }

  const menuFor = (job: main.Job): MenuEntry[] => [
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
