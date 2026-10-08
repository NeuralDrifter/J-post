import { describe, expect, it } from 'vitest'
import type { main } from './backend'
import { attemptLabel, canRetry, compareAttempts } from './plans'

const plan = {
  questions: [
    { question: 'Tell me about a migration.', tests: 'ownership', minutes: 5, probes: ['p'], strongAnswer: ['s'] },
    { question: 'A conflict?', tests: 'collaboration', minutes: 5, probes: ['p'], strongAnswer: ['s'] },
  ],
  resumeClaims: [],
} as unknown as main.InterviewPlan

const review = (question: string, planIndex?: number) =>
  ({ question, answerSummary: `summary of ${question}`, worked: '', improve: `improve ${question}`, strongerAnswer: '', planIndex }) as main.QuestionReview

const attempt = (id: string, questions: main.QuestionReview[] | null) =>
  ({
    id,
    scorecards: questions ? [{ provider: 'gemini-live', model: '', createdAt: '', scorecard: { questions } }] : [],
  }) as unknown as main.MockInterview

describe('attemptLabel', () => {
  it('numbers attempts only when there is more than one', () => {
    expect(attemptLabel(2, 3)).toBe('Attempt 2 of 3')
    expect(attemptLabel(1, 1)).toBe('')
    expect(attemptLabel(0, 0)).toBe('')
  })
})

describe('canRetry', () => {
  it('needs a readable plan', () => {
    expect(canRetry({ planId: 'p1', planError: '' })).toBe(true)
    expect(canRetry({ planId: '', planError: '' })).toBe(false)
    expect(canRetry({ planId: 'p1', planError: 'unreadable' })).toBe(false)
  })
})

describe('compareAttempts', () => {
  it('groups answers by planned question, in plan and attempt order', () => {
    const got = compareAttempts(plan, [
      attempt('a1', [review('Q2 asked first', 1), review('Q1', 0)]),
      attempt('a2', [review('Q1 again', 0), review('Q2 again', 1)]),
    ])
    expect(got.questions.map((q) => q.question)).toEqual(['Tell me about a migration.', 'A conflict?'])
    expect(got.questions[0].byAttempt).toEqual([
      { attemptId: 'a1', answerSummary: 'summary of Q1', improve: 'improve Q1' },
      { attemptId: 'a2', answerSummary: 'summary of Q1 again', improve: 'improve Q1 again' },
    ])
    expect(got.questions[1].byAttempt.map((a) => a.attemptId)).toEqual(['a1', 'a2'])
    expect(got.other).toEqual([])
  })

  it('files missing or out-of-range planIndex under other questions', () => {
    const got = compareAttempts(plan, [attempt('a1', [review('off plan'), review('too high', 5), review('negative', -1), review('Q1', 0)])])
    expect(got.other).toEqual([{ attemptId: 'a1', reviews: [review('off plan'), review('too high', 5), review('negative', -1)] }])
    expect(got.questions[0].byAttempt).toHaveLength(1)
    expect(got.questions[1].byAttempt).toEqual([])
  })

  it('skips attempts that were never scored', () => {
    const got = compareAttempts(plan, [attempt('a1', null), attempt('a2', [review('Q1', 0)])])
    expect(got.questions[0].byAttempt.map((a) => a.attemptId)).toEqual(['a2'])
    expect(got.other).toEqual([])
  })
})
