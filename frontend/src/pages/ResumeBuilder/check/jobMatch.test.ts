// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { newResumeData } from '../../../lib/resumes/document'
import { hideTerm } from './checkEdits'
import { blocksMentioning, defaultPostingJobId, loadMatcher, matchPosting, termAsWritten } from './jobMatch'

const POSTING = `We need a backend engineer with Kubernetes, PostgreSQL and Go.
You will run Kubernetes clusters and tune PostgreSQL. Go experience required. Kubernetes on-call.`

const resume = produce(newResumeData('blank', 'azurill'), (d) => {
  d.basics.name = 'Ada Lovelace'
  d.summary.content = '<p>Backend engineer who writes Go and tunes PostgreSQL.</p>'
})

const lower = (terms: { label: string }[]) => terms.map((t) => t.label.toLowerCase())

describe('job match', () => {
  it('sorts posting terms into found and missing', async () => {
    const result = matchPosting(await loadMatcher(), POSTING, resume)
    expect(lower(result.missing)).toContain('kubernetes')
    expect(lower(result.found)).toContain('postgresql')
    expect(result.total).toBe(result.found.length + result.missing.length)
  })

  it('leaves out terms hidden as not true', async () => {
    const matcher = await loadMatcher()
    const term = matchPosting(matcher, POSTING, resume).missing.find((t) => t.label.toLowerCase() === 'kubernetes')!
    const hidden = matchPosting(matcher, POSTING, produce(resume, hideTerm(term.term)))
    expect(hidden.missing.map((t) => t.term)).not.toContain(term.term)
  })

  it('labels a term as the posting writes it', () => {
    expect(termAsWritten(['figma'], 'Experience with Figma is a plus')).toBe('Figma')
    expect(termAsWritten(['c#', 'csharp'], 'Strong C# skills')).toBe('C#')
    expect(termAsWritten(['rust'], 'No match here')).toBeUndefined()
  })

  it('finds the blocks that mention a term', () => {
    expect(blocksMentioning(resume, 'postgresql')).toEqual([{ kind: 'section', sectionId: 'summary' }])
    expect(blocksMentioning(resume, 'lovelace')).toEqual([{ kind: 'header' }])
  })
})

describe('which posting to match', () => {
  const job = (id: string, resumeId = '', description = 'A posting') => ({ id, resumeId, description })

  it('prefers the job the resume was tailored for', () => {
    expect(defaultPostingJobId({ id: 'r1', jobId: 'j2' }, [job('j1', 'r1'), job('j2')])).toBe('j2')
  })

  it('falls back to a job that uses the resume', () => {
    expect(defaultPostingJobId({ id: 'r1', jobId: '' }, [job('j1'), job('j2', 'r1')])).toBe('j2')
  })

  it('skips jobs with no posting saved', () => {
    expect(defaultPostingJobId({ id: 'r1', jobId: 'j1' }, [job('j1', 'r1', '  ')])).toBe('')
  })
})
