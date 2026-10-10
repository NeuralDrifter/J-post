// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Copy, FileDown, FolderOpen, Pencil, RotateCcw, Star, StarOff, Trash2 } from 'lucide-react'
import { confirmThen, promptDialog } from '../../components/ConfirmDialog'
import { api, apiOk } from '../../lib/api'
import { DeleteDocumentForever, DuplicateDocument, RenameDocument, RestoreDocument, TrashDocument, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import type { MenuEntry } from '../../lib/menu'
import { exportStoredDocument, setDefaultResume } from '../../lib/resumes/actions'
import { RESUME_KIND } from '../../lib/resumes/paths'
import { toast } from '../../lib/toast'
import { exportMenuItems } from '../ResumeBuilder/exportMenu'

/** "resume" or "cover letter", for menus and messages. */
export function kindNoun(doc: app.Document): string {
  return doc.kind === RESUME_KIND ? 'resume' : 'cover letter'
}

async function rename(doc: app.Document) {
  const name = await promptDialog({ title: `Rename ${kindNoun(doc)}`, label: 'Name', initial: doc.name, confirmLabel: 'Rename' })
  if (name && (await apiOk(RenameDocument(doc.id, name)))) notifyDataChanged()
}

async function duplicate(doc: app.Document) {
  if (await api(DuplicateDocument(doc.id))) notifyDataChanged()
}

async function moveToTrash(doc: app.Document) {
  if (!(await apiOk(TrashDocument(doc.id)))) return
  toast.success(`"${doc.name}" moved to Trash`)
  notifyDataChanged()
}

export async function restoreDocument(doc: app.Document) {
  if (await apiOk(RestoreDocument(doc.id))) notifyDataChanged()
}

export async function deleteForever(doc: app.Document) {
  const deleted = await confirmThen(
    { title: 'Delete forever?', message: `"${doc.name}" will be permanently deleted. Jobs that used it will no longer link to it.`, confirmLabel: 'Delete' },
    () => DeleteDocumentForever(doc.id),
  )
  if (deleted) notifyDataChanged()
}

/** The right-click menu of a live resume or letter. Only resumes can be the default. */
export function liveDocumentMenu(doc: app.Document, isDefault: boolean, open: () => void): MenuEntry[] {
  const defaultEntry: MenuEntry[] =
    doc.kind !== RESUME_KIND
      ? []
      : [isDefault ? { label: 'Stop using as default', icon: StarOff, onSelect: () => setDefaultResume('') } : { label: 'Set as default', icon: Star, onSelect: () => setDefaultResume(doc.id) }]
  return [
    { label: 'Open', icon: FolderOpen, onSelect: open },
    { label: 'Rename', icon: Pencil, onSelect: () => rename(doc) },
    { label: 'Duplicate', icon: Copy, onSelect: () => duplicate(doc) },
    ...defaultEntry,
    { label: 'Export', icon: FileDown, submenu: exportMenuItems((format) => exportStoredDocument(doc, format)) },
    'separator',
    { label: 'Move to Trash', icon: Trash2, danger: true, onSelect: () => moveToTrash(doc) },
  ]
}

/** The right-click menu of a document in Trash. */
export function trashedDocumentMenu(doc: app.Document): MenuEntry[] {
  return [
    { label: 'Restore', icon: RotateCcw, onSelect: () => restoreDocument(doc) },
    'separator',
    { label: 'Delete forever', icon: Trash2, danger: true, onSelect: () => deleteForever(doc) },
  ]
}
