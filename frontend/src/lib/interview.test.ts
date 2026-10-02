import { describe, expect, it } from 'vitest'
import type { main } from './backend'
import { holdSession, peekSession, releaseSession } from './interview'

describe('pending live sessions', () => {
  it('can be read repeatedly (React may run state setup twice) until released', () => {
    holdSession({ sessionId: 's1', token: 't' } as main.LiveSession)
    expect(peekSession('s1')?.token).toBe('t')
    expect(peekSession('s1')?.token).toBe('t')
    releaseSession('s1')
    expect(peekSession('s1')).toBeUndefined()
  })
})
