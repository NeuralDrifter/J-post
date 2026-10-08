// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { main, ai } from '../../lib/backend'
import { AttemptsStrip, CompareAttempts, PlanView } from './PlanParts'

const plan = {
  questions: [
    { question: 'Tell me about a migration.', tests: 'ownership', minutes: 5, probes: ['What did you own?'], strongAnswer: ['Names the baseline'] },
    { question: 'A conflict?', tests: 'collaboration', minutes: 4, probes: ['How did it end?'], strongAnswer: ['Shows empathy'] },
  ],
  resumeClaims: [{ claim: 'Cut deploy time 60%', probe: 'From what?' }],
} as unknown as main.InterviewPlan

const providers = [{ id: 'claude-code', label: 'Claude Code', unavailable: '' }] as ai.AIProvider[]

const overall = (n: number) => ({ communication: n, structure: n, relevance: n, depth: n, confidence: n })

describe('PlanView', () => {
  it('shows every part of the plan and who wrote it', () => {
    const record = { id: 'p1', provider: 'claude-code', model: 'claude-opus-5-5', createdAt: '', plan } as unknown as main.InterviewPlanRecord
    const html = renderToStaticMarkup(createElement(PlanView, { record, providers }))
    for (const text of ['Tell me about a migration.', 'ownership', 'What did you own?', 'Names the baseline', 'A conflict?', 'Shows empathy', 'Cut deploy time 60%', 'From what?']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('Planned by Claude Code · claude-opus-5-5')
  })
})

describe('AttemptsStrip', () => {
  const attempts = [
    { id: 'a1', startedAt: '2026-10-01T12:00:00Z', overall: overall(3) },
    { id: 'a2', startedAt: '2026-10-02T12:00:00Z' },
    { id: 'a3', startedAt: '2026-10-03T12:00:00Z', overall: overall(4) },
  ] as main.AttemptSummary[]

  it('labels the current attempt and lists each with its score', () => {
    const html = renderToStaticMarkup(createElement(AttemptsStrip, { current: 'a2', attempts, onOpen: () => {} }))
    expect(html).toContain('Attempt 2 of 3')
    expect(html).toContain('3')
    expect(html).toContain('4')
    expect(html).toContain('—')
    expect(html.match(/<button/g)).toHaveLength(3)
  })

  it('renders nothing for a single attempt', () => {
    expect(renderToStaticMarkup(createElement(AttemptsStrip, { current: 'a1', attempts: attempts.slice(0, 1), onOpen: () => {} }))).toBe('')
  })
})

describe('CompareAttempts', () => {
  const card = (questions: main.QuestionReview[], n: number) => [{ provider: 'gemini-live', model: '', createdAt: '', scorecard: { overall: overall(n), questions } }]
  const q = (summary: string, planIndex?: number) => ({ question: summary, answerSummary: summary, worked: '', improve: `fix ${summary}`, strongerAnswer: '', planIndex })

  it('shows scores per attempt and each attempt’s answer under its planned question', () => {
    const attempts = [
      { id: 'a1', startedAt: '2026-10-01T12:00:00Z', scorecards: card([q('first try', 0)], 2) },
      { id: 'a2', startedAt: '2026-10-02T12:00:00Z', scorecards: card([q('second try', 0)], 4) },
    ] as unknown as main.MockInterview[]
    const html = renderToStaticMarkup(createElement(CompareAttempts, { plan, attempts }))
    for (const text of ['Communication', 'Attempt 1', 'Attempt 2', 'Tell me about a migration.', 'first try', 'second try', 'fix second try']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('Other questions')
  })

  it('lists unmatched answers under Other questions', () => {
    const attempts = [
      { id: 'a1', startedAt: '2026-10-01T12:00:00Z', scorecards: card([q('off plan')], 2) },
      { id: 'a2', startedAt: '2026-10-02T12:00:00Z', scorecards: [] },
    ] as unknown as main.MockInterview[]
    const html = renderToStaticMarkup(createElement(CompareAttempts, { plan, attempts }))
    expect(html).toContain('Other questions')
    expect(html).toContain('off plan')
  })
})
