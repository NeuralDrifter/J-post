// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import {
  daysLabel,
  formatDate,
  formatDateTime,
  formatSalary,
  fromLocalInputValue,
  initials,
  labelFor,
  lookup,
  parseSalaryInput,
  percent,
  STATUS_DOT,
  STATUS_LABEL,
  toLocalInputValue,
} from './format'

describe('formatSalary', () => {
  it('formats ranges and partial data', () => {
    expect(formatSalary(120000, 150000)).toBe('$120k – $150k')
    expect(formatSalary(93600, 114400)).toBe('$93.6k – $114.4k')
    expect(formatSalary(120000, undefined)).toBe('$120k+')
    expect(formatSalary(undefined, 90000)).toBe('Up to $90k')
    expect(formatSalary(100000, 100000)).toBe('$100k')
  })
  it('treats zero and missing as unknown', () => {
    expect(formatSalary(0, 0)).toBe('')
    expect(formatSalary(undefined, undefined)).toBe('')
    expect(formatSalary(0, 80000)).toBe('Up to $80k')
  })
})

describe('initials', () => {
  it('uses the first letters of the first two words', () => {
    expect(initials('Watershed Climate')).toBe('WC')
    expect(initials('Stripe')).toBe('ST')
    expect(initials('   ')).toBe('?')
  })
})

describe('dates', () => {
  it('parses YYYY-MM-DD as a local date', () => {
    expect(formatDate('2026-10-01')).toBe('Oct 1, 2026')
    expect(formatDate('')).toBe('')
    expect(formatDate('garbage')).toBe('')
  })
  it('formats 12-hour local times', () => {
    expect(formatDateTime(new Date(2026, 9, 2, 15, 0).toISOString())).toBe('Oct 2, 3:00 PM')
    expect(formatDateTime(new Date(2026, 9, 2, 0, 5).toISOString())).toBe('Oct 2, 12:05 AM')
  })
  it('round-trips datetime-local values', () => {
    const iso = fromLocalInputValue('2026-10-02T15:30')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(toLocalInputValue(iso)).toBe('2026-10-02T15:30')
    expect(fromLocalInputValue('')).toBe('')
  })
  it('labels days', () => {
    expect(daysLabel(0)).toBe('Today')
    expect(daysLabel(1)).toBe('1 day')
    expect(daysLabel(12)).toBe('12 days')
  })
})

describe('parseSalaryInput', () => {
  it('accepts common salary spellings', () => {
    expect(parseSalaryInput('120k')).toBe(120000)
    expect(parseSalaryInput('$120,000')).toBe(120000)
    expect(parseSalaryInput('95.5K')).toBe(95500)
  })
  it('rejects blank and invalid input', () => {
    expect(parseSalaryInput('')).toBeUndefined()
    expect(parseSalaryInput('abc')).toBeUndefined()
    expect(parseSalaryInput('-5')).toBeUndefined()
    expect(parseSalaryInput('0')).toBeUndefined()
  })
})

describe('percent', () => {
  it('shows a dash when unknown', () => {
    expect(percent(undefined)).toBe('—')
    expect(percent(1 / 3)).toBe('33%')
  })
})

describe('timeAgo', () => {
  it('describes how long ago a timestamp was', async () => {
    const { timeAgo } = await import('./format')
    const now = new Date('2026-10-01T12:00:00.000Z')
    expect(timeAgo('2026-10-01T11:59:40.000Z', now)).toBe('just now')
    expect(timeAgo('2026-10-01T11:15:00.000Z', now)).toBe('45 min ago')
    expect(timeAgo('2026-10-01T10:00:00.000Z', now)).toBe('2h ago')
    expect(timeAgo('2026-09-28T12:00:00.000Z', now)).toBe('3 days ago')
    expect(timeAgo('', now)).toBe('')
  })
})

describe('labelFor and lookup', () => {
  it('finds known backend values and falls back for unknown ones', () => {
    expect(labelFor(STATUS_LABEL, 'applied')).toBe('Applied')
    expect(labelFor(STATUS_LABEL, 'archived')).toBe('archived')
    expect(lookup(STATUS_DOT, 'archived', 'bg-ink-3')).toBe('bg-ink-3')
  })
})
