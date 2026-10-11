// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'
import { groupLines, issueOnLine, parsedFields, type ParsedPdf } from './parsedPdf'

const parsed = {
  doc: { lines: ['Ada Lovelace', 'ada@example.com', 'EXPERIENCE', 'Engineer, Acme', 'Jan 2020 - Present', 'SKILLS', 'Go'].map((text) => ({ text })) },
  semantics: {
    headings: [
      { text: 'EXPERIENCE', lineIndex: 2 },
      { text: 'SKILLS', lineIndex: 5 },
    ],
    contact: { nameLine: 'Ada Lovelace', locationLine: null, emails: ['ada@example.com'], phones: [], textUrls: ['github.com/ada'], annotationUrls: ['github.com/ada'] },
    dates: [{ parsed: true }, { parsed: false }],
  },
} as unknown as ParsedPdf

const issue = (code: string, value?: string) => ({ key: code, number: 1, finding: { code, params: value ? { value } : undefined } }) as unknown as CheckIssue

describe('parser view', () => {
  it('groups lines under the headings a parser found', () => {
    expect(groupLines(parsed)).toEqual([
      { heading: null, lines: ['Ada Lovelace', 'ada@example.com'] },
      { heading: 'EXPERIENCE', lines: ['Engineer, Acme', 'Jan 2020 - Present'] },
      { heading: 'SKILLS', lines: ['Go'] },
    ])
  })

  it('lists recognised fields with the issue behind each', () => {
    const fields = parsedFields(parsed, [issue('MISSING_PHONE')])
    const byId = Object.fromEntries(fields.map((f) => [f.id, f]))
    expect(byId.name?.value).toBe('Ada Lovelace')
    expect(byId.links?.value).toBe('github.com/ada')
    expect(byId.dates?.value).toBe('2 found, 1 unreadable')
    expect(byId.phone?.issue?.finding.code).toBe('MISSING_PHONE')
    expect(byId.email?.issue).toBeUndefined()
  })

  it('ties an issue to the line showing its text', () => {
    const link = issue('MALFORMED_URL', 'github.com/ada')
    expect(issueOnLine([link], 'Links: github.com/ada')).toBe(link)
    expect(issueOnLine([issue('X', 'ab')], 'ab cd')).toBeUndefined()
  })
})
