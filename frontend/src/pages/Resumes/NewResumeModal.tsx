// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type SubmitEvent } from 'react'
import { FilePlus2, Sparkles, type LucideIcon } from 'lucide-react'
import { Modal } from '../../components/Modal'
import type { app } from '../../lib/backend'
import { createResume } from '../../lib/resumes/actions'
import type { ResumeStart, Template } from '../../lib/resumes/document'
import { TemplatePicker } from './TemplatePicker'

const STARTS: { id: ResumeStart; label: string; detail: string; icon: LucideIcon }[] = [
  { id: 'blank', label: 'Blank', detail: 'Empty sections to fill in.', icon: FilePlus2 },
  { id: 'sample', label: 'Sample content', detail: 'An example resume to edit, so you can see every section.', icon: Sparkles },
]

/** Names a new resume, picks its starting content and template, and creates it. */
export function NewResumeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (doc: app.Document) => void }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState<ResumeStart>('blank')
  const [template, setTemplate] = useState<Template>('onyx')
  const [busy, setBusy] = useState(false)

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    setBusy(true)
    const doc = await createResume(name.trim(), start, template)
    setBusy(false)
    if (doc) onCreated(doc)
  }

  return (
    <Modal title="New resume" onClose={onClose} width="max-w-4xl">
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="label-mono">Name</span>
          <input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Backend — 2026" autoFocus required />
        </label>

        <fieldset>
          <legend className="label-mono mb-1.5">Start from</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTS.map((option) => (
              <StartOption key={option.id} {...option} selected={start === option.id} onSelect={() => setStart(option.id)} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label-mono mb-1.5">Template</legend>
          <div className="max-h-[42vh] overflow-y-auto pr-1">
            <TemplatePicker value={template} onChange={setTemplate} />
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create resume'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function StartOption({ label, detail, icon: Icon, selected, onSelect }: { label: string; detail: string; icon: LucideIcon; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
        selected ? 'border-accent bg-accent/10' : 'border-line bg-white/[0.02] hover:border-line-strong'
      }`}
    >
      <Icon size={18} className={selected ? 'text-indigo-300' : 'text-ink-3'} />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink-2">{detail}</span>
      </span>
    </button>
  )
}
