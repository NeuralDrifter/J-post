import type { main } from './backend'
import { parseSalaryInput } from './format'

/** Form state for creating or editing a job: every field as the user typed it. */
export type JobDraft = {
  company: string
  position: string
  status: string
  workMode: string
  location: string
  url: string
  salaryMin: string
  salaryMax: string
  dateApplied: string
  followUpOn: string
}

export function emptyDraft(): JobDraft {
  return {
    company: '',
    position: '',
    status: 'interested',
    workMode: '',
    location: '',
    url: '',
    salaryMin: '',
    salaryMax: '',
    dateApplied: '',
    followUpOn: '',
  }
}

export function draftFromJob(job: main.Job): JobDraft {
  return {
    company: job.company,
    position: job.position,
    status: job.status,
    workMode: job.workMode,
    location: job.location,
    url: job.url,
    salaryMin: job.salaryMin ? String(job.salaryMin) : '',
    salaryMax: job.salaryMax ? String(job.salaryMax) : '',
    dateApplied: job.dateApplied,
    followUpOn: job.followUpOn,
  }
}

/** Builds a Job from the form; `base` supplies everything the form doesn't edit. */
export function jobFromDraft(d: JobDraft, base?: main.Job): main.Job {
  return {
    id: base?.id ?? '',
    company: d.company.trim(),
    position: d.position.trim(),
    status: base?.status ?? d.status,
    closeReason: base?.closeReason ?? '',
    location: d.location.trim(),
    workMode: d.workMode,
    salaryMin: parseSalaryInput(d.salaryMin),
    salaryMax: parseSalaryInput(d.salaryMax),
    salaryText: base?.salaryText ?? '',
    url: d.url.trim(),
    source: base?.source ?? 'manual',
    description: base?.description ?? '',
    datePosted: base?.datePosted ?? '',
    dateApplied: d.dateApplied,
    followUpOn: d.followUpOn,
    notes: base?.notes ?? '',
    createdAt: base?.createdAt ?? '',
    updatedAt: base?.updatedAt ?? '',
  }
}
