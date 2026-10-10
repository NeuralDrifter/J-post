// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Link } from 'react-router'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import type { app } from '../../lib/backend'
import { exportRawDocument } from '../../lib/resumes/actions'

/** A saved document that no longer reads: shown, never overwritten, and exportable as-is. */
export function RepairView({ doc, error, back }: { doc: app.Document; error: string; back: { to: string; label: string } }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <Link to={back.to} className="flex w-fit items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={13} /> {back.label}
      </Link>
      <div className="glass space-y-3 rounded-2xl p-5">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle size={18} className="text-warn" /> “{doc.name}” can't be opened
        </h1>
        <p className="text-sm text-ink-2">{error}</p>
        <p className="text-sm text-ink-2">Nothing was changed. Save a copy of its data to keep it, or move it to Trash.</p>
        <button type="button" className="btn btn-ghost" onClick={() => void exportRawDocument(doc)}>
          Save its data as JSON
        </button>
      </div>
    </div>
  )
}
