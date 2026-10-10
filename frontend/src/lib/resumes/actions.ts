// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Resume actions shared by the library and the builder. Each reports failures
// as toasts (through api/apiOk) and resolves to whether it succeeded.
import { api, apiOk } from '../api'
import { CreateDocument, SaveExportedFile, SetDefaultResume, type app } from '../backend'
import { notifyDataChanged } from '../events'
import { toast } from '../toast'
import { newResumeData, parseStoredResume, resumePlainText, serializeResume, type ResumeData, type ResumeStart, type Template } from './document'
import { exportFileName } from './library'
import { renderResumePdf } from './render'

export const RESUME_KIND = 'resume'

export async function createResume(name: string, start: ResumeStart, template: Template): Promise<app.Document | undefined> {
  const data = newResumeData(start, template)
  return api(CreateDocument(RESUME_KIND, name, serializeResume(data), resumePlainText(data)))
}

export async function setDefaultResume(id: string): Promise<boolean> {
  const ok = await apiOk(SetDefaultResume(id))
  if (ok) {
    toast.success(id ? 'Default resume set' : 'Default resume cleared')
    notifyDataChanged()
  }
  return ok
}

export async function exportResumePdf(name: string, data: ResumeData): Promise<boolean> {
  try {
    return await saveFile(exportFileName(name, 'pdf'), await renderResumePdf(data))
  } catch (err) {
    toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

export async function exportResumeDocx(name: string, data: ResumeData): Promise<boolean> {
  try {
    const { buildDocx } = await import('@reactive-resume/docx')
    return await saveFile(exportFileName(name, 'docx'), await buildDocx(data))
  } catch (err) {
    toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

export function exportResumeJson(name: string, data: ResumeData): Promise<boolean> {
  return saveFile(exportFileName(name, 'json'), new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
}

/** Exports a stored document straight from the library, without opening it. */
export async function exportStoredResume(doc: app.Document, format: 'pdf' | 'json'): Promise<boolean> {
  const parsed = parseStoredResume(doc.data)
  if (!parsed.ok) {
    toast.error(parsed.error)
    return false
  }
  return format === 'pdf' ? exportResumePdf(doc.name, parsed.data) : exportResumeJson(doc.name, parsed.data)
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
