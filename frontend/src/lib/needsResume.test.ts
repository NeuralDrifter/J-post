// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { hasUsableResume, isNeedsResume, needsResumeStep, needsResumeText, returnTarget, withReturn } from './needsResume'

const backend = 'needs-resume: This needs a resume. Choose a default resume, or create or import one.'

describe('isNeedsResume', () => {
  it('spots the backend marker, and strips it for display', () => {
    expect(isNeedsResume(backend)).toBe(true)
    expect(isNeedsResume('Anthropic API: timeout')).toBe(false)
    expect(needsResumeText(backend)).toBe('This needs a resume. Choose a default resume, or create or import one.')
  })
})

describe('needsResumeStep', () => {
  it("offers to restore the job's own resume when it's in the Trash", () => {
    const step = needsResumeStep({ live: [{ id: 'a' }], trashed: [{ id: 't', name: 'Tailored' }], jobResumeId: 't' })
    expect(step).toEqual({ kind: 'restore', resumeId: 't', name: 'Tailored' })
  })

  it('asks for a default when resumes exist', () => {
    expect(needsResumeStep({ live: [{ id: 'a' }], trashed: [], jobResumeId: 'gone' })).toEqual({ kind: 'choose-default' })
  })

  it('asks to make one when there are none', () => {
    expect(needsResumeStep({ live: [], trashed: [{ id: 't', name: 'Old' }] })).toEqual({ kind: 'create' })
  })
})

describe('return links', () => {
  it('carries where to come back to', () => {
    expect(withReturn('/resumes?new=resume', '/jobs/7?tab=ats')).toBe('/resumes?new=resume&return=%2Fjobs%2F7%3Ftab%3Dats')
    expect(withReturn('/resumes/abc', '/discover')).toBe('/resumes/abc?return=%2Fdiscover')
  })

  it('only goes back to a place inside the app', () => {
    const fallback = { to: '/resumes', label: 'Resumes' }
    expect(returnTarget('?return=%2Fjobs%2F7', fallback)).toEqual({ to: '/jobs/7', label: 'Back' })
    expect(returnTarget('?return=https%3A%2F%2Fevil.test', fallback)).toBe(fallback)
    expect(returnTarget('?return=%2F%2Fevil.test', fallback)).toBe(fallback)
    expect(returnTarget('', fallback)).toBe(fallback)
  })
})

describe('hasUsableResume', () => {
  it("is true when the job's resume or the default is in the library", () => {
    expect(hasUsableResume([{ id: 'a' }], ['', 'a'])).toBe(true)
    expect(hasUsableResume([{ id: 'a' }], ['gone', ''])).toBe(false)
    expect(hasUsableResume([], ['', ''])).toBe(false)
  })
})
