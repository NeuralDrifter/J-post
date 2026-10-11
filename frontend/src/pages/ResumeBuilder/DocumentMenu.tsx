// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Copy, Info, Printer, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import type { app } from '../../lib/backend'
import { formatDate, formatDateTime, timeAgo } from '../../lib/format'
import type { MenuEntry } from '../../lib/menu'
import { moveToTrash, printDocument } from '../../lib/resumes/actions'
import { countWords, templateLabel } from '../../lib/resumes/library'
import type { Exportable } from '../../lib/resumes/stored'
import { duplicate, kindNoun, lockEntry } from '../Resumes/documentMenu'

type Options = {
  doc: app.Document
  exportable: Exportable
  /** Where to go once the document is in Trash. */
  back: string
  details: { template: string; pageCount: number; plainText: string }
}

/** The menu by an open document's name (duplicate, lock, details, print, Trash), and its Details dialog. */
export function useDocumentMenu({ doc, exportable, back, details }: Options) {
  const navigate = useNavigate()
  const [showDetails, setShowDetails] = useState(false)
  const trash = async () => {
    if (await moveToTrash(doc)) navigate(back)
  }
  const items: MenuEntry[] = [
    { label: 'Duplicate', icon: Copy, onSelect: () => duplicate(doc) },
    lockEntry(doc),
    'separator',
    { label: 'Details', icon: Info, onSelect: () => setShowDetails(true) },
    { label: 'Print', icon: Printer, shortcut: 'Ctrl+P', onSelect: () => printDocument(exportable) },
    'separator',
    { label: 'Move to Trash', icon: Trash2, danger: true, disabled: doc.locked, onSelect: () => void trash() },
  ]
  const dialog = showDetails && <DocumentDetails doc={doc} {...details} onClose={() => setShowDetails(false)} />
  return { items, dialog, print: () => printDocument(exportable) }
}

type DetailsProps = Options['details'] & { doc: app.Document; onClose: () => void }

function DocumentDetails({ doc, template, pageCount, plainText, onClose }: DetailsProps) {
  const rows: [string, string, string?][] = [
    ['Created', formatDate(doc.createdAt)],
    ['Last edited', timeAgo(doc.updatedAt), formatDateTime(doc.updatedAt)],
    ['Template', templateLabel(template)],
    ['Length', pageCount > 0 ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : '—'],
    ['Words', String(countWords(plainText))],
    ['Editing', doc.locked ? 'Locked. Unlock it from this menu to edit.' : 'Open to edits'],
  ]
  return (
    <Modal title={doc.name} onClose={onClose} width="max-w-md">
      <p className="-mt-3 mb-4 text-sm text-ink-3">{kindNoun(doc) === 'resume' ? 'Resume details' : 'Cover letter details'}</p>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([label, value, title]) => (
          <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2">
            <dt className="text-ink-3">{label}</dt>
            <dd title={title}>{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
