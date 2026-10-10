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

/** The PDF a source stands for: a resume exported as it would be sent, or the attached file itself. */
async function sourceFile(source: AtsSource): Promise<File> {
  if (source.kind === 'attachment') return new File([base64Bytes(await ReadAttachment(source.id))], `${source.label}.pdf`, { type: 'application/pdf' })
  const [{ readStoredDocument }, { renderResumePdf }] = await Promise.all([import('./stored'), import('./render')])
  const stored = readStoredDocument(await GetDocument(source.id))
  if ('error' in stored) throw new Error(stored.error)
  return new File([await renderResumePdf(stored.page.data, stored.page.renderOptions)], `${source.label}.pdf`, { type: 'application/pdf' })
}

function base64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
