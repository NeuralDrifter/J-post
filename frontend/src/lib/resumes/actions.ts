// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Document actions shared by the library and the editors. Each reports failures
// as toasts (through api/apiOk) and resolves to whether it succeeded.
import { api, apiOk } from '../api'
import { CreateDocument, SaveExportedFile, SetDefaultResume, type app } from '../backend'
import { notifyDataChanged } from '../events'
import { toast } from '../toast'
import { newResumeData, resumePlainText, serializeResume, type ResumeData, type ResumeStart, type Template } from './document'
import { letterPlainText, newLetterData, serializeLetter } from './letter'
import { exportFileName } from './library'
import { renderResumePdf } from './render'
import { LETTER_KIND, readStoredDocument, RESUME_KIND, type Exportable, type PrintablePage } from './stored'

export type ExportFormat = 'pdf' | 'docx' | 'json'

export async function createResume(name: string, start: ResumeStart, template: Template): Promise<app.Document | undefined> {
  const data = newResumeData(start, template)
  return api(CreateDocument(RESUME_KIND, name, serializeResume(data), resumePlainText(data)))
}

/** A new letter carrying the sender details and design of `source` (or blank). */
export async function createLetter(name: string, source: ResumeData | null): Promise<app.Document | undefined> {
  const letter = newLetterData(source)
  return api(CreateDocument(LETTER_KIND, name, serializeLetter(letter), letterPlainText(letter)))
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
    return await saveFile(exportFileName(name, format), await exportContent(page, json, format))
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
  return saveFile(exportFileName(doc.name, 'json'), new Blob([doc.data], { type: 'application/json' }))
}

async function saveFile(fileName: string, content: Blob): Promise<boolean> {
  const path = await api(SaveExportedFile(fileName, await blobToBase64(content)))
  if (path) toast.success(`Saved ${path}`)
  return Boolean(path)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
