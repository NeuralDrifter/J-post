import { describe, expect, it } from 'vitest'
import type { main } from './backend'
import { draftFromJob, emptyDraft, jobFromDraft, jobFromResult } from './jobDraft'

const baseJob = {
  id: 'j1',
  company: 'Acme',
  position: 'Dev',
  status: 'interviewing',
  closeReason: '',
  location: 'Denver, CO',
  workMode: 'hybrid',
  salaryMin: 120000,
  salaryMax: 150000,
  salaryText: '$120,000–$150,000/yr',
  url: 'https://acme.test/1',
  source: 'linkedin',
  description: 'Build things',
  datePosted: '2026-09-20',
  dateApplied: '2026-09-25',
  followUpOn: '',
  notes: 'my notes',
  createdAt: 'c',
  updatedAt: 'u',
} as main.Job

describe('jobFromDraft', () => {
  it('trims fields and parses salary text', () => {
    const job = jobFromDraft({ ...emptyDraft(), company: ' Acme ', position: ' Dev ', salaryMin: '120k', salaryMax: '$150,000' })
    expect(job.company).toBe('Acme')
    expect(job.position).toBe('Dev')
    expect(job.salaryMin).toBe(120000)
    expect(job.salaryMax).toBe(150000)
    expect(job.status).toBe('wishlist')
    expect(job.source).toBe('manual')
  })

  it('round-trips an existing job and keeps fields the form does not edit', () => {
    const draft = draftFromJob(baseJob)
    expect(draft.salaryMin).toBe('120000')
    const job = jobFromDraft({ ...draft, position: 'Senior Dev', salaryMax: '' }, baseJob)
    expect(job.position).toBe('Senior Dev')
    expect(job.salaryMax).toBeUndefined()
    expect(job.status).toBe('interviewing')
    expect(job.notes).toBe('my notes')
    expect(job.description).toBe('Build things')
    expect(job.source).toBe('linkedin')
    expect(job.id).toBe('j1')
  })
})

describe('jobFromResult', () => {
  it('maps a discover result to a wishlist job', () => {
    const job = jobFromResult({
      key: 'k',
      title: 'Go Dev',
      company: '',
      location: 'Remote',
      workMode: 'remote',
      salaryMin: 93600,
      salaryText: '$45/hr',
      annualized: true,
      description: 'desc',
      datePosted: '2026-09-30',
      url: 'https://x.test',
      sources: ['indeed', 'linkedin'],
      trackedJobId: '',
      trackedStatus: '',
    } as main.DiscoverResult)
    expect(job.company).toBe('Unknown company')
    expect(job.position).toBe('Go Dev')
    expect(job.status).toBe('wishlist')
    expect(job.source).toBe('indeed')
    expect(job.salaryMin).toBe(93600)
    expect(job.description).toBe('desc')
  })
})
