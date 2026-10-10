// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { atsSources, parseStoredReport } from './atsCheck'

const resumes = [
  { id: 'r1', name: 'Backend' },
  { id: 'r2', name: 'Platform' },
]
const files = [
  { id: 'f1', label: 'Sent resume', fileName: 'cv.pdf' },
  { id: 'f2', label: 'Offer letter', fileName: 'offer.docx' },
]

describe('atsSources', () => {
  it("lists the job's resume, then the default, then every resume and attached PDF", () => {
    const sources = atsSources({ linkedResumeId: 'r2', defaultResumeId: 'r1', resumes, files })
    expect(sources.map((s) => s.label)).toEqual(['Platform (sent for this job)', 'Backend (default)', 'Sent resume (attached PDF)'])
    expect(sources[0]).toEqual({ kind: 'document', id: 'r2', label: 'Platform (sent for this job)' })
    expect(sources[2]).toEqual({ kind: 'attachment', id: 'f1', label: 'Sent resume (attached PDF)' })
  })

  it('lists each resume once when the linked one is the default', () => {
    const sources = atsSources({ linkedResumeId: 'r1', defaultResumeId: 'r1', resumes, files: [] })
    expect(sources.map((s) => s.label)).toEqual(['Backend (sent for this job)', 'Platform'])
  })

  it('offers every resume when none is linked or default', () => {
    expect(atsSources({ linkedResumeId: '', defaultResumeId: '', resumes, files: [] }).map((s) => s.label)).toEqual(['Backend', 'Platform'])
  })
})

describe('parseStoredReport', () => {
  it('reads a stored report of the version it knows', () => {
    expect(parseStoredReport('{"version":1,"score":80}')?.score).toBe(80)
  })

  it('ignores reports it cannot read', () => {
    expect(parseStoredReport('{broken')).toBeNull()
    expect(parseStoredReport('{"version":2}')).toBeNull()
  })
})
