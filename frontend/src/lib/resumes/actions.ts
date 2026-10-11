// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Document actions shared by the library and the editors. Each reports failures
// as toasts (through api/apiOk) and resolves to whether it succeeded.
import { api, apiOk } from '../api'
import { CreateDocument, FetchPicture, RestoreDocument, SetDefaultResume, SetDocumentLocked, TrashDocument, type app } from '../backend'
import { notifyDataChanged } from '../events'
import { exportFileName, saveExport } from '../exportFiles'
import { toast } from '../toast'
import { newResumeData, resumePlainText, serializeResume, type ResumeData, type ResumeStart, type Template } from './document'
import type { ImportResult } from './importFile'
import { letterPlainText, newLetterData, serializeLetter, type LetterData } from './letter'
import { renderResumePdf } from './render'
import { LETTER_KIND, RESUME_KIND } from './paths'
import { printPdf } from './print'
import { readStoredDocument, type Exportable, type PrintablePage } from './stored'

export type ExportFormat = 'pdf' | 'docx' | 'json'

export async function createResume(name: string, start: ResumeStart, template: Template): Promise<app.Document | undefined> {
  const data = newResumeData(start, template)
  return api(CreateDocument(RESUME_KIND, name, serializeResume(data), resumePlainText(data)))
}

/** A new letter carrying the sender details and design of `source` (or blank). */
export function createLetter(name: string, source: ResumeData | null): Promise<app.Document | undefined> {
  return saveLetter(name, newLetterData(source))
}

function saveLetter(name: string, letter: LetterData): Promise<app.Document | undefined> {
  return api(CreateDocument(LETTER_KIND, name, serializeLetter(letter), letterPlainText(letter)))
}

/**
 * Saves what an import read: the resume (with its photo stored inside it) and any letters it carried, or the
 * letter. Resolves to the main document created, or undefined if it failed.
 */
export async function saveImport(result: ImportResult, name: string): Promise<app.Document | undefined> {
  if (result.kind === 'letter') return saveLetter(name, result.letter)
  const data = await withLocalPicture(result.data)
  const resume = await api(CreateDocument(RESUME_KIND, name, serializeResume(data), resumePlainText(data)))
  if (resume) for (const letter of result.letters) await saveLetter(`${name} — ${letter.name}`, letter)
  return resume
}

/** A photo linked from the web is downloaded into the resume; one that can't be is left out, with a note. */
async function withLocalPicture(data: ResumeData): Promise<ResumeData> {
  if (!/^https?:\/\//i.test(data.picture.url)) return data
  try {
    return { ...data, picture: { ...data.picture, url: await FetchPicture(data.picture.url) } }
  } catch (err) {
    toast.info(`The photo couldn't be downloaded (${err instanceof Error ? err.message : String(err)}), so it was left out.`)
    return { ...data, picture: { ...data.picture, url: '' } }
  }
}

export async function setDefaultResume(id: string): Promise<boolean> {
  const ok = await apiOk(SetDefaultResume(id))
  if (ok) {
    toast.success(id ? 'Default resume set' : 'Default resume cleared')
    notifyDataChanged()
  }
  return ok
}

export async function exportDocument({ name, page, json }: Exportable, format: ExportFormat): Promise<boolean> {
  try {
    return await saveExport(exportFileName(name, format), await exportContent(page, json, format))
  } catch (err) {
    toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

async function exportContent(page: PrintablePage, json: unknown, format: ExportFormat): Promise<Blob> {
  if (format === 'pdf') return renderResumePdf(page.data, page.renderOptions)
  if (format === 'json') return new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
  const { buildDocx } = await import('@reactive-resume/docx')
  return buildDocx(page.data)
}

/** Prints a document: its PDF, through the system print dialog. */
export async function printDocument({ page }: Exportable): Promise<boolean> {
  try {
    printPdf(await renderResumePdf(page.data, page.renderOptions))
    return true
  } catch (err) {
    toast.error(`Printing failed: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/** Locks a document against edits (it can still be exported and copied), or unlocks it. */
export async function setDocumentLocked(doc: app.Document, locked: boolean): Promise<boolean> {
  const ok = await apiOk(SetDocumentLocked(doc.id, locked))
  if (ok) {
    toast.success(locked ? `"${doc.name}" is locked. Unlock it to edit.` : `"${doc.name}" can be edited again`)
    notifyDataChanged()
  }
  return ok
}

/** Moves a document to Trash, with Undo in the toast: Trash keeps it until emptied. */
export async function moveToTrash(doc: app.Document): Promise<boolean> {
  if (!(await apiOk(TrashDocument(doc.id)))) return false
  notifyDataChanged()
  toast.success(`"${doc.name}" moved to Trash`, { label: 'Undo', onClick: () => void restoreFromTrash(doc) })
  return true
}

export async function restoreFromTrash(doc: app.Document): Promise<boolean> {
  const ok = await apiOk(RestoreDocument(doc.id))
  if (ok) notifyDataChanged()
  return ok
}

/** Exports a stored document straight from the library, without opening it. */
export async function exportStoredDocument(doc: app.Document, format: ExportFormat): Promise<boolean> {
  const exportable = readStoredDocument(doc)
  if ('error' in exportable) {
    toast.error(exportable.error)
    return false
  }
  return exportDocument(exportable, format)
}

/** Saves a stored document's data exactly as stored, e.g. one that no longer opens. */
export function exportRawDocument(doc: app.Document): Promise<boolean> {
  return saveExport(exportFileName(doc.name, 'json'), new Blob([doc.data], { type: 'application/json' }))
}
