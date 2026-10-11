// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The ATS check: how applicant tracking systems read a resume's PDF, and how
// well it covers a job description. Reactive Resume's engine does the reading;
// this module picks what to check and keeps the result.
import type { PdfAtsReport } from '@reactive-resume/resume/ats-pdf'
import { GetDocument, ReadAttachment, SaveAtsReport } from '../backend'

export type { PdfAtsReport }

/** Something a job's ATS check can run on: one of the resumes, or a PDF attached to the job. */
export type AtsSource = { kind: 'document' | 'attachment'; id: string; label: string }

/** Source for a standalone check: an uploaded PDF file, or a resume chosen from the library. */
export type StandaloneSource =
  | { kind: 'file'; file: File }
  | { kind: 'document'; id: string; name: string }

export function standaloneSourceLabel(source: StandaloneSource): string {
  return source.kind === 'file' ? source.file.name : `${source.name} (from library)`
}

/** Explains ATS extraction and check failures in plain words. */
export function atsErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'PdfPasswordRequiredError' || /password/i.test(err.message)) {
      return 'This PDF is password-protected. Unlock it before checking.'
    }
    if (err.name === 'PdfTooLargeError' || /too large/i.test(err.message)) {
      return 'This PDF is too large to check in the browser (maximum 25 MB).'
    }
    if (err.name === 'PdfUnreadableError' || /could not be read as a PDF/i.test(err.message)) {
      return 'This file could not be read as a PDF.'
    }
    if (/no text layer/i.test(err.message)) {
      return 'No text could be read from this PDF. Export it as a text PDF rather than an image or scan.'
    }
    return err.message
  }
  return String(err)
}

type SourceInput = {
  linkedResumeId: string
  defaultResumeId: string
  resumes: { id: string; name: string }[]
  files: { id: string; label: string; fileName: string }[]
}

/** The job's own resume first, then the default, the other resumes, and the job's attached PDFs. */
export function atsSources({ linkedResumeId, defaultResumeId, resumes, files }: SourceInput): AtsSource[] {
  const rank = (id: string) => (id === linkedResumeId ? 0 : id === defaultResumeId ? 1 : 2)
  const suffix = (id: string) => (id === linkedResumeId ? ' (sent for this job)' : id === defaultResumeId ? ' (default)' : '')
  const documents = [...resumes]
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((r): AtsSource => ({ kind: 'document', id: r.id, label: `${r.name}${suffix(r.id)}` }))
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.fileName)).map((f): AtsSource => ({ kind: 'attachment', id: f.id, label: `${f.label || f.fileName} (attached PDF)` }))
  return [...documents, ...pdfs]
}

const REPORT_VERSION = 1

/** A stored report, or null when it can't be read (or is from a newer version). */
export function parseStoredReport(json: string): PdfAtsReport | null {
  try {
    const report = JSON.parse(json) as PdfAtsReport
    return report?.version === REPORT_VERSION ? report : null
  } catch {
    return null
  }
}

/** Checks a source against the job description and keeps the report as the job's latest. */
export async function runAtsCheck(jobId: string, source: AtsSource, jobDescription: string): Promise<PdfAtsReport> {
  const [{ runAtsCheck: analyze }, file] = await Promise.all([import('@reactive-resume/web/features/ats-checker/run-ats-check'), sourceFile(source)])
  const { report } = await analyze(file, { jobDescription })
  await SaveAtsReport(jobId, JSON.stringify(report), source.label)
  return report
}

/** Runs an ATS check on an arbitrary PDF File, optionally against a job description, without saving. */
export async function runStandaloneAtsCheck(file: File, jobDescription: string = ''): Promise<PdfAtsReport> {
  const { runAtsCheck: analyze } = await import('@reactive-resume/web/features/ats-checker/run-ats-check')
  const { report } = await analyze(file, jobDescription.trim() ? { jobDescription } : {})
  return report
}

/** Renders one of the user's saved resumes to a PDF File for checking. */
export async function renderDocumentToPdfFile(id: string, name: string): Promise<File> {
  const [{ readStoredDocument }, { renderResumePdf }] = await Promise.all([import('./stored'), import('./render')])
  const stored = readStoredDocument(await GetDocument(id))
  if ('error' in stored) throw new Error(stored.error)
  const blob = await renderResumePdf(stored.page.data, stored.page.renderOptions)
  return new File([blob], `${name}.pdf`, { type: 'application/pdf' })
}

/** The PDF a source stands for: a resume exported as it would be sent, or the attached file itself. */
async function sourceFile(source: AtsSource): Promise<File> {
  if (source.kind === 'attachment') return new File([base64Bytes(await ReadAttachment(source.id))], `${source.label}.pdf`, { type: 'application/pdf' })
  return renderDocumentToPdfFile(source.id, source.label)
}

function base64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
