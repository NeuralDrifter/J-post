// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { atsErrorMessage, atsSources, parseStoredReport, standaloneSourceLabel } from './atsCheck'

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

describe('atsErrorMessage', () => {
  it('explains password protection in plain words', () => {
    const err = new Error('password required')
    err.name = 'PdfPasswordRequiredError'
    expect(atsErrorMessage(err)).toBe('This PDF is password-protected. Unlock it before checking.')
  })

  it('explains oversized files in plain words', () => {
    const err = new Error('This PDF is too large to check in the browser.')
    err.name = 'PdfTooLargeError'
    expect(atsErrorMessage(err)).toBe('This PDF is too large to check in the browser (maximum 25 MB).')
  })

  it('explains unreadable files in plain words', () => {
    const err = new Error('This file could not be read as a PDF.')
    err.name = 'PdfUnreadableError'
    expect(atsErrorMessage(err)).toBe('This file could not be read as a PDF.')
  })

  it('explains missing text layer in plain words', () => {
    expect(atsErrorMessage(new Error('No text layer found in document'))).toBe(
      'No text could be read from this PDF. Export it as a text PDF rather than an image or scan.',
    )
  })

  it('preserves generic errors', () => {
    expect(atsErrorMessage(new Error('Network disconnected'))).toBe('Network disconnected')
    expect(atsErrorMessage('unexpected failure')).toBe('unexpected failure')
  })
})

describe('standaloneSourceLabel', () => {
  it('labels uploaded files by their file name', () => {
    const file = new File(['%PDF'], 'candidate.pdf', { type: 'application/pdf' })
    expect(standaloneSourceLabel({ kind: 'file', file })).toBe('candidate.pdf')
  })

  it('labels library resumes with a hint', () => {
    expect(standaloneSourceLabel({ kind: 'document', id: 'r1', name: 'Full Stack' })).toBe('Full Stack (from library)')
  })
})

