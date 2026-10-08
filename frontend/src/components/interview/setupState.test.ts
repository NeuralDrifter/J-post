import { describe, expect, it } from 'vitest'
import type { main } from '../../lib/backend'
import { closeUnlessStarting, initialSetup, preparingLabel } from './setupState'

const job = (status: string) => ({ id: 'j1', status }) as main.Job

describe('initialSetup', () => {
  it('keeps the usual defaults for a new interview', () => {
    expect(initialSetup(job('interviewing'))).toEqual({
      kind: 'behavioral',
      minutes: 25,
      persona: 'neutral',
      voice: '',
      interviewerName: '',
      focus: '',
      planProvider: '',
      retryOf: '',
    })
    expect(initialSetup(job('applied')).kind).toBe('phone_screen')
  })

  it('takes the type and length from the interview being retried', () => {
    const s = initialSetup(job('interviewing'), { id: 'm1', kind: 'technical', minutes: 45, startedAt: '2026-10-07T12:00:00Z' })
    expect(s.kind).toBe('technical')
    expect(s.minutes).toBe(45)
    expect(s.retryOf).toBe('m1')
  })
})

describe('preparingLabel', () => {
  it('names the planner, or just starts a retry', () => {
    expect(preparingLabel('Claude Code', false)).toBe('Preparing your questions with Claude Code…')
    expect(preparingLabel('Claude Code', true)).toBe('Starting…')
  })
})

describe('closeUnlessStarting', () => {
  it('ignores close requests while the interview is being prepared', () => {
    let closed = 0
    const onClose = () => closed++
    closeUnlessStarting(true, onClose)()
    expect(closed).toBe(0)
    closeUnlessStarting(false, onClose)()
    expect(closed).toBe(1)
  })
})
