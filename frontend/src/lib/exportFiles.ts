// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Files the job search exports: the pipeline as CSV and interviews as a
// calendar (.ics). Both follow Reactive Resume's exporters
// (apps/web/src/features/applications/{csv,ics}.ts, MIT).
import { api } from './api'
import { SaveExportedFile, type app } from './backend'
import { CLOSE_REASON_LABEL, labelFor, STATUS_LABEL, WORK_MODE_LABEL } from './format'
import { toast } from './toast'

/** Characters a spreadsheet reads as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/

/** One CSV cell: quoted when needed, and never something a spreadsheet would run as a formula. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const CSV_COLUMNS: [header: string, cell: (job: app.Job) => string][] = [
  ['Company', (j) => j.company],
  ['Position', (j) => j.position],
  ['Stage', (j) => labelFor(STATUS_LABEL, j.status)],
  ['Closed because', (j) => (j.closeReason ? labelFor(CLOSE_REASON_LABEL, j.closeReason) : '')],
  ['Location', (j) => j.location],
  ['Work mode', (j) => (j.workMode ? labelFor(WORK_MODE_LABEL, j.workMode) : '')],
  ['Salary', (j) => salary(j)],
  ['URL', (j) => j.url],
  ['Source', (j) => j.source],
  ['Posted', (j) => j.datePosted],
  ['Applied', (j) => j.dateApplied],
  ['Follow up on', (j) => j.followUpOn],
  ['Added', (j) => j.createdAt],
  ['Last changed', (j) => j.updatedAt],
  ['Notes', (j) => j.notes],
]

function salary(job: app.Job): string {
  if (job.salaryMin && job.salaryMax) return `${job.salaryMin}–${job.salaryMax}`
  return String(job.salaryMin || job.salaryMax || job.salaryText || '')
}

/** The pipeline as CSV, with a byte-order mark so spreadsheets read names in any language. */
export function jobsToCsv(jobs: app.Job[]): string {
  const rows = [CSV_COLUMNS.map(([header]) => header), ...jobs.map((job) => CSV_COLUMNS.map(([, cell]) => cell(job)))]
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export type CalendarEvent = { uid: string; title: string; start: Date; minutes: number; location?: string; description?: string }

const MINUTE_MS = 60_000
const MAX_LINE_OCTETS = 75

// RFC 5545: backslashes, semicolons and commas are escaped; line breaks become \n.
const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const utcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Lines longer than 75 characters continue on lines that start with a space. */
function fold(line: string): string[] {
  const parts = [line.slice(0, MAX_LINE_OCTETS)]
  for (let i = MAX_LINE_OCTETS; i < line.length; i += MAX_LINE_OCTETS - 1) parts.push(` ${line.slice(i, i + MAX_LINE_OCTETS - 1)}`)
  return parts
}

function eventLines(event: CalendarEvent, now: Date): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${event.uid}@jobtrack`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(new Date(event.start.getTime() + event.minutes * MINUTE_MS))}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    'END:VEVENT',
  ]
}

/** Events as a calendar file any calendar app can import. */
export function buildCalendar(events: CalendarEvent[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//J-POST//Interviews//EN', 'CALSCALE:GREGORIAN', ...events.flatMap((e) => eventLines(e, now)), 'END:VCALENDAR']
  return `${lines.flatMap(fold).join('\r\n')}\r\n`
}

/** A job's interviews as calendar events: "Phone screen · Acme — Staff Engineer". */
export function interviewEvents(interviews: app.Interview[], job: app.Job, kindLabel: (kind: string) => string): CalendarEvent[] {
  return interviews.map((iv) => interviewEvent(iv, job, kindLabel))
}

function interviewEvent(iv: app.Interview, job: { company: string; position: string }, kindLabel: (kind: string) => string): CalendarEvent {
  return {
    uid: iv.id,
    title: `${kindLabel(iv.kind)} · ${job.company} — ${job.position}`,
    start: new Date(iv.scheduledAt),
    minutes: iv.durationMin || DEFAULT_INTERVIEW_MINUTES,
    location: iv.locationOrLink,
    description: iv.notes,
  }
}

/** Saves every job's interviews as one calendar file. */
export function exportAllInterviews(interviews: app.ScheduledInterview[], kindLabel: (kind: string) => string): Promise<boolean> {
  const ics = buildCalendar(interviews.map((iv) => interviewEvent(iv, iv, kindLabel)))
  return saveExport('J-POST interviews.ics', new Blob([ics], { type: 'text/calendar' }))
}

const DEFAULT_INTERVIEW_MINUTES = 60

/** Saves interviews as a calendar file named after the job. */
export function exportInterviews(interviews: app.Interview[], job: app.Job, kindLabel: (kind: string) => string): Promise<boolean> {
  const ics = buildCalendar(interviewEvents(interviews, job, kindLabel))
  return saveExport(exportFileName(`Interviews - ${job.company}`, 'ics'), new Blob([ics], { type: 'text/calendar' }))
}

/** Characters Windows doesn't allow in file names. */
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]+/g

/** A file name safe on Windows, from a document's or job's name ("Document" when nothing is left). */
export function exportFileName(name: string, extension: string): string {
  const safe = name.replace(UNSAFE_FILE_CHARS, ' ').replace(/\s+/g, ' ').trim()
  return `${safe || 'Document'}.${extension}`
}

/** Saves jobs as a CSV file. */
export function exportJobsCsv(jobs: app.Job[]): Promise<boolean> {
  return saveExport('J-POST pipeline.csv', new Blob([jobsToCsv(jobs)], { type: 'text/csv' }))
}

/** Asks where to save content and writes it there; true once saved. */
export async function saveExport(fileName: string, content: Blob): Promise<boolean> {
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
