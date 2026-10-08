// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { main } from './backend'
import { attachTips, filterByJob, gradeActions, holdSession, peekSession, releaseSession } from './interview'

describe('pending live sessions', () => {
  it('can be read repeatedly (React may run state setup twice) until released', () => {
    holdSession({ sessionId: 's1', token: 't' } as main.LiveSession)
    expect(peekSession('s1')?.token).toBe('t')
    expect(peekSession('s1')?.token).toBe('t')
    releaseSession('s1')
    expect(peekSession('s1')).toBeUndefined()
  })
})

describe('attachTips', () => {
  const lines = [
    { speaker: 'interviewer', text: 'Tell me about yourself.', atMs: 0 },
    { speaker: 'you', text: 'I started in recruiting.', atMs: 4000 },
    { speaker: 'interviewer', text: 'And then?', atMs: 9000 },
    { speaker: 'you', text: 'Chief AI Officer.', atMs: 12000 },
  ] as main.TranscriptLine[]
  const tip = (answerAtMs: number, text: string) => ({ answerAtMs, kind: 'tip', text, provider: 'gemini-live', model: 'm' }) as main.InterviewTip

  it('matches tips to the answer they were about', () => {
    const { byLine, unmatched } = attachTips(lines, [tip(4000, 'Lead with the result'), tip(12300, 'Own the title')])
    expect(byLine.get(1)?.map((t) => t.text)).toEqual(['Lead with the result'])
    expect(byLine.get(3)?.map((t) => t.text)).toEqual(['Own the title'])
    expect(byLine.has(0)).toBe(false)
    expect(unmatched).toEqual([])
  })

  it('keeps unmatched tips', () => {
    const { byLine, unmatched } = attachTips(lines, [tip(99_000, 'Orphan tip'), tip(9000, 'Not on an interviewer line')])
    expect(byLine.size).toBe(0)
    expect(unmatched.map((t) => t.text)).toEqual(['Orphan tip', 'Not on an interviewer line'])
  })
})

describe('gradeActions', () => {
  it('lets you pick a provider whenever an interview can be graded', () => {
    expect(gradeActions('failed')).toEqual({ gradeNow: true, gradeWith: true })
    expect(gradeActions('unscored')).toEqual({ gradeNow: true, gradeWith: true })
    expect(gradeActions('live')).toEqual({ gradeNow: true, gradeWith: true })
    expect(gradeActions('done')).toEqual({ gradeNow: false, gradeWith: true })
    expect(gradeActions('scoring')).toEqual({ gradeNow: false, gradeWith: false })
  })
})

describe('filterByJob', () => {
  const list = [{ id: '1', jobId: 'a' }, { id: '2', jobId: 'b' }, { id: '3', jobId: 'a' }]
  it('keeps the chosen job', () => {
    expect(filterByJob(list, 'a').map((m) => m.id)).toEqual(['1', '3'])
    expect(filterByJob(list, '').map((m) => m.id)).toEqual(['1', '2', '3'])
  })
  it('shows everything when the chosen job has no interviews left', () => {
    expect(filterByJob(list, 'deleted-job').map((m) => m.id)).toEqual(['1', '2', '3'])
  })
})
