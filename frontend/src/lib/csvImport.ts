// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Jobs read from a CSV file: J-POST's own export, or a spreadsheet from
// another tracker. Follows Reactive Resume's application import
// (apps/web/src/features/applications/csv.ts, MIT): its parser, header
// matching and formula-guard handling, on J-POST's fields and stages.
import type { app } from './backend'
import { CLOSE_REASON_LABEL, parseSalaryInput, STATUS_LABEL, WORK_MODE_LABEL } from './format'
import { emptyDraft, jobFromDraft } from './jobDraft'

/** Parses CSV text into rows of cells: quoted fields, doubled quotes, any line ending; blank rows dropped. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '') // the byte-order mark spreadsheets prepend
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const endField = () => {
    row.push(field)
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') inQuotes = false
      else field += char
    } else if (char === '"') inQuotes = true
    else if (char === ',') endField()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      endField()
      rows.push(row)
      row = []
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    endField()
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

/** Where a column's values go. */
export type CsvField =
  | 'company'
  | 'position'
  | 'status'
  | 'closeReason'
  | 'location'
  | 'workMode'
  | 'salary'
  | 'url'
  | 'source'
  | 'datePosted'
  | 'dateApplied'
  | 'followUpOn'
  | 'notes'
  | 'description'

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  company: 'Company',
  position: 'Position',
  status: 'Stage',
  closeReason: 'Closed because',
  location: 'Location',
  workMode: 'Work mode',
  salary: 'Salary',
  url: 'Link',
  source: 'Source',
  datePosted: 'Posted',
  dateApplied: 'Applied',
  followUpOn: 'Follow up on',
  notes: 'Notes',
  description: 'Job description',
}

const HEADER_ALIASES: Record<string, CsvField> = {
  company: 'company', employer: 'company', organization: 'company', organisation: 'company',
  position: 'position', role: 'position', title: 'position', 'job title': 'position',
  stage: 'status', status: 'status',
  'closed because': 'closeReason', 'close reason': 'closeReason', outcome: 'closeReason',
  location: 'location', city: 'location',
  'work mode': 'workMode', remote: 'workMode', 'work type': 'workMode',
  salary: 'salary', 'salary range': 'salary', compensation: 'salary', pay: 'salary',
  url: 'url', link: 'url', 'job url': 'url', 'job posting': 'url', 'job link': 'url',
  source: 'source',
  posted: 'datePosted', 'date posted': 'datePosted',
  applied: 'dateApplied', 'applied date': 'dateApplied', 'date applied': 'dateApplied', 'applied on': 'dateApplied', 'stage date': 'dateApplied',
  'follow up on': 'followUpOn', 'follow up': 'followUpOn', 'follow-up': 'followUpOn',
  notes: 'notes', note: 'notes', comments: 'notes',
  'job description': 'description', description: 'description',
}

/** Each header's field, or null to leave the column out; a field is used once, by its first column. */
export function autoMapHeaders(headers: readonly string[]): (CsvField | null)[] {
  const used = new Set<CsvField>()
  return headers.map((header) => {
    const field = HEADER_ALIASES[header.trim().toLowerCase()] ?? null
    if (!field || used.has(field)) return null
    used.add(field)
    return field
  })
}

/** Stage words from J-POST and other trackers. */
const STAGE_WORDS: Record<string, string> = {
  ...invert(STATUS_LABEL),
  saved: 'interested', wishlist: 'interested', bookmarked: 'interested', 'to apply': 'interested',
  screening: 'applied', submitted: 'applied',
  interview: 'interviewing', interviews: 'interviewing',
  offered: 'offer',
  rejected: 'closed', archived: 'closed', withdrawn: 'closed', ghosted: 'closed', declined: 'closed',
}

/** Stages that imply why the job closed, when no reason column says so. */
const IMPLIED_REASON: Record<string, string> = { rejected: 'rejected', withdrawn: 'withdrawn', ghosted: 'ghosted', declined: 'declined', archived: 'ghosted' }

function invert(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).flatMap(([value, label]) => [[label.toLowerCase(), value], [value, value]]))
}

const REASON_WORDS = invert(CLOSE_REASON_LABEL)
const WORK_MODE_WORDS: Record<string, string> = { ...invert(WORK_MODE_LABEL), 'on site': 'onsite', 'in office': 'onsite', office: 'onsite' }

/** Undoes the apostrophe J-POST's export puts before cells a spreadsheet would run as formulas. */
function stripFormulaGuard(value: string): string {
  return value.startsWith("'") && /^[=+\-@\t\r]/.test(value.slice(1)) ? value.slice(1) : value
}

/** A date written as YYYY-MM-DD (or a full timestamp, cut to its date); anything else is left out. */
function dateOnly(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match?.[1] ?? ''
}

/** "100000–150000", "$120k - $140k" or one figure. */
function parseSalary(value: string): { min?: number; max?: number; text: string } {
  const parts = value.split(/\s*[-–—]\s*|\s+to\s+/i).filter(Boolean)
  const [min, max] = parts.map(parseSalaryInput)
  if (parts.length === 2 && min && max) return { min, max, text: '' }
  if (parts.length === 1 && min) return { min, text: '' }
  return { text: value.trim() }
}

export type CsvImport = { jobs: app.Job[]; skipped: number }

/** Turns rows (the first being headers) into jobs; rows without both a company and a position are skipped. */
export function mapCsvToJobs(table: readonly string[][], mapping: readonly (CsvField | null)[]): CsvImport {
  const [, ...rows] = table
  const jobs: app.Job[] = []
  let skipped = 0
  for (const row of rows) {
    const cells: Partial<Record<CsvField, string>> = {}
    mapping.forEach((field, i) => {
      if (field) cells[field] = stripFormulaGuard(row[i] ?? '').trim()
    })
    const job = jobFromCells(cells)
    if (job) jobs.push(job)
    else skipped++
  }
  return { jobs, skipped }
}

function jobFromCells(cells: Partial<Record<CsvField, string>>): app.Job | null {
  const company = cells.company ?? ''
  const position = cells.position ?? ''
  if (!company || !position) return null
  const stageWord = (cells.status ?? '').toLowerCase()
  const status = STAGE_WORDS[stageWord] ?? 'interested'
  const reason = REASON_WORDS[(cells.closeReason ?? '').toLowerCase()] ?? IMPLIED_REASON[stageWord] ?? 'ghosted'
  const salary = parseSalary(cells.salary ?? '')
  const base = jobFromDraft({ ...emptyDraft(), company, position, status })
  return {
    ...base,
    status,
    closeReason: status === 'closed' ? reason : '',
    location: cells.location ?? '',
    workMode: WORK_MODE_WORDS[(cells.workMode ?? '').toLowerCase()] ?? '',
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryText: salary.text,
    url: cells.url ?? '',
    source: cells.source || 'manual',
    datePosted: dateOnly(cells.datePosted ?? ''),
    dateApplied: dateOnly(cells.dateApplied ?? ''),
    followUpOn: dateOnly(cells.followUpOn ?? ''),
    notes: cells.notes ?? '',
    description: cells.description ?? '',
  }
}

/** Jobs not already in the pipeline (the same company and position, ignoring case). */
export function newJobsOnly(imported: readonly app.Job[], existing: readonly app.Job[]): app.Job[] {
  const key = (job: app.Job) => `${job.company.trim().toLowerCase()}\u0000${job.position.trim().toLowerCase()}`
  const seen = new Set(existing.map(key))
  return imported.filter((job) => {
    if (seen.has(key(job))) return false
    seen.add(key(job))
    return true
  })
}
