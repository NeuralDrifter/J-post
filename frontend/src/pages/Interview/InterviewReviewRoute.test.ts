// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ id: 'attempt-2' }),
}))

import InterviewReviewPage, { InterviewReviewRoute } from './InterviewReviewPage'

describe('InterviewReviewRoute', () => {
  it('keys the review page by interview id, so moving between attempts starts fresh', () => {
    const el = InterviewReviewRoute()
    expect(el.type).toBe(InterviewReviewPage)
    expect(el.key).toBe('attempt-2')
  })
})
