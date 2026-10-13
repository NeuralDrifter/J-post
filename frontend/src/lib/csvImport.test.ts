// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app } from './backend'
import { autoMapHeaders, mapCsvToJobs, newJobsOnly, parseCsv } from './csvImport'
import { jobsToCsv } from './exportFiles'
import { emptyDraft, jobFromDraft } from './jobDraft'

const importCsv = (text: string) => {
  const table = parseCsv(text)
  return mapCsvToJobs(table, autoMapHeaders(table[0] ?? []))
}

describe('parsing CSV', () => {
  it('reads quoted fields, doubled quotes, commas and line breaks inside quotes', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi""\nthere"\r\n1,2,3\n\n')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['1', '2', '3'],
    ])
  })

  it('matches headers from other trackers, each field once', () => {
    expect(autoMapHeaders(['Employer', 'Job Title', 'Status', 'Mystery', 'Company'])).toEqual(['company', 'position', 'status', null, null])
  })
})

describe('importing jobs', () => {
  it('reads J-POST’s own export back', () => {
    const original: app.Job = {
      ...jobFromDraft({ ...emptyDraft(), company: 'Acme', position: 'Staff Engineer', status: 'closed' }),
      status: 'closed',
      closeReason: 'rejected',
      workMode: 'remote',
      salaryMin: 120000,
      salaryMax: 150000,
      url: 'https://acme.example/jobs/1',
      dateApplied: '2026-09-01',
      notes: '=SUM(A1) is not a formula here',
    }
    const { jobs, skipped } = importCsv(jobsToCsv([original]))
    expect(skipped).toBe(0)
    expect(jobs[0]).toMatchObject({
      company: 'Acme',
      position: 'Staff Engineer',
      status: 'closed',
      closeReason: 'rejected',
      workMode: 'remote',
      salaryMin: 120000,
      salaryMax: 150000,
      url: 'https://acme.example/jobs/1',
      dateApplied: '2026-09-01',
      notes: '=SUM(A1) is not a formula here',
    })
  })

  it('understands other trackers’ stages', () => {
    const { jobs } = importCsv('Company,Role,Stage\nA,Dev,Wishlist\nB,Dev,Screening\nC,Dev,Interview\nD,Dev,Rejected\nE,Dev,Something odd')
    expect(jobs.map((j) => [j.status, j.closeReason])).toEqual([
      ['interested', ''],
      ['applied', ''],
      ['interviewing', ''],
      ['closed', 'rejected'],
      ['interested', ''],
    ])
  })

  it('skips rows without a company or a position', () => {
    const { jobs, skipped } = importCsv('Company,Position\nAcme,\n,Dev\nGlobex,SRE')
    expect(jobs.map((j) => j.company)).toEqual(['Globex'])
    expect(skipped).toBe(2)
  })

  it('keeps a salary it can’t read as text', () => {
    const { jobs } = importCsv('Company,Position,Salary\nAcme,Dev,DOE\nB,Dev,$90k')
    expect(jobs[0]).toMatchObject({ salaryText: 'DOE', salaryMin: undefined })
    expect(jobs[1]).toMatchObject({ salaryMin: 90000 })
  })

  it('leaves out jobs already in the pipeline, and repeats within the file', () => {
    const existing = importCsv('Company,Position\nAcme,Dev').jobs
    const imported = importCsv('Company,Position\nacme,dev\nGlobex,SRE\nGlobex,SRE').jobs
    expect(newJobsOnly(imported, existing).map((j) => j.company)).toEqual(['Globex'])
  })
})
