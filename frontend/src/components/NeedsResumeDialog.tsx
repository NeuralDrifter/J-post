// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { FileUp, Plus, RotateCcw } from 'lucide-react'
import { api, apiOk } from '../lib/api'
import { ListDocuments, RestoreDocument, SetDefaultResume, type app } from '../lib/backend'
import { notifyDataChanged } from '../lib/events'
import { needsResumeStep, onNeedsResume, withReturn, type NeedsResumeRequest, type NeedsResumeStep } from '../lib/needsResume'
import { RESUME_KIND } from '../lib/resumes/paths'
import { toast } from '../lib/toast'
import { Modal } from './Modal'

type Open = { step: NeedsResumeStep; resumes: app.Document[] }

/** Answers every "needs a resume" error in the app with the step that fixes it. Mounted once, in the shell. */
export function NeedsResumeHost() {
  const [open, setOpen] = useState<Open | null>(null)
  useEffect(() => {
    const unsubscribe = onNeedsResume((request) => {
      void load(request).then((next) => next && setOpen(next))
    })
    return unsubscribe
  }, [])
  if (!open) return null
  return <NeedsResumeDialog open={open} onClose={() => setOpen(null)} />
}

async function load({ jobResumeId }: NeedsResumeRequest): Promise<Open | undefined> {
  const [live, trashed] = await Promise.all([api(ListDocuments(RESUME_KIND, false)), api(ListDocuments(RESUME_KIND, true))])
  if (!live || !trashed) return undefined
  return { step: needsResumeStep({ live, trashed, jobResumeId }), resumes: live }
}

function NeedsResumeDialog({ open, onClose }: { open: Open; onClose: () => void }) {
  const { step, resumes } = open
  const done = (message: string) => {
    toast.success(message)
    notifyDataChanged()
    onClose()
  }
  return (
    <Modal title="This needs a resume" onClose={onClose}>
      {step.kind === 'restore' && <RestoreStep step={step} onDone={done} />}
      {step.kind === 'choose-default' && <ChooseDefaultStep resumes={resumes} onDone={done} />}
      {step.kind === 'create' && <CreateStep onLeave={onClose} />}
    </Modal>
  )
}

function RestoreStep({ step, onDone }: { step: Extract<NeedsResumeStep, { kind: 'restore' }>; onDone: (message: string) => void }) {
  const restore = async () => {
    if (await apiOk(RestoreDocument(step.resumeId))) onDone(`${step.name} is back. Try again.`)
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        The resume chosen for this job, <strong className="text-ink">{step.name}</strong>, is in the Trash.
      </p>
      <button type="button" className="btn btn-primary" onClick={restore}>
        <RotateCcw size={15} /> Restore it
      </button>
    </div>
  )
}

function ChooseDefaultStep({ resumes, onDone }: { resumes: app.Document[]; onDone: (message: string) => void }) {
  const [chosen, setChosen] = useState(resumes[0]?.id ?? '')
  const choose = async () => {
    const name = resumes.find((r) => r.id === chosen)?.name ?? 'That resume'
    if (await apiOk(SetDefaultResume(chosen))) onDone(`${name} is now your default resume. Try again.`)
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">Choose the resume that match scores, mock interviews and the AI features should read. You can change it any time in Settings.</p>
      <select className="field" value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="Default resume">
        {resumes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-primary" onClick={choose}>
        Make it my default
      </button>
    </div>
  )
}

function CreateStep({ onLeave }: { onLeave: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const here = location.pathname + location.search
  const go = (path: string) => {
    onLeave()
    navigate(withReturn(path, here))
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">You don't have a resume yet. Make one in the resume builder, or import the one you already have. It becomes your default.</p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => go('/resumes?new=resume')}>
          <Plus size={15} /> Create a resume
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => go('/resumes?import=1')}>
          <FileUp size={15} /> Import one
        </button>
      </div>
    </div>
  )
}
