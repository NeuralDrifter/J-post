// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { CLOSE_REASONS, CLOSE_REASON_LABEL } from '../lib/format'
import { Modal } from './Modal'

const HINT: Record<string, string> = {
  rejected: 'They went another way',
  withdrawn: 'I pulled out',
  ghosted: 'Never heard back',
  declined: 'I turned down an offer',
}

export function CloseReasonPicker({
  company,
  onPick,
  onCancel,
}: {
  company: string
  onPick: (reason: string, note: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  return (
    <Modal title={`Close ${company}`} onClose={onCancel} width="max-w-md">
      <p className="mb-4 text-sm text-ink-2">How did this one end? It stays in your history either way.</p>
      <div className="grid grid-cols-2 gap-2">
        {CLOSE_REASONS.map((r) => (
          <button key={r} className="btn btn-ghost flex-col items-start gap-0.5 py-3 text-left" onClick={() => onPick(r, note)}>
            <span>{CLOSE_REASON_LABEL[r]}</span>
            <span className="text-xs font-normal text-ink-3">{HINT[r]}</span>
          </button>
        ))}
      </div>
      <label className="mt-4 block space-y-1.5">
        <span className="label-mono">Note (optional)</span>
        <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="mt-4 flex justify-end">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
