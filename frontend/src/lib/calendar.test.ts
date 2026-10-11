// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { addMonths, dayKey, groupByDay, monthGrid } from './calendar'

describe('month calendar', () => {
  it('lays a month out in six Monday-first weeks', () => {
    const grid = monthGrid(new Date(2026, 9, 15)) // October 2026 starts on a Thursday
    expect(grid).toHaveLength(6)
    expect(grid.every((week) => week.length === 7 && week[0]!.getDay() === 1)).toBe(true)
    expect(dayKey(grid[0]![0]!)).toBe('2026-09-28')
    expect(dayKey(grid[0]![3]!)).toBe('2026-10-01')
  })

  it('groups interviews by local day, in time order', () => {
    const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString()
    const days = groupByDay([{ id: 'b', scheduledAt: at(2, 15) }, { id: 'a', scheduledAt: at(2, 9) }, { id: 'c', scheduledAt: at(9, 10) }])
    expect(days.get('2026-10-02')?.map((i) => i.id)).toEqual(['a', 'b'])
    expect(days.get('2026-10-09')?.map((i) => i.id)).toEqual(['c'])
  })

  it('moves between months across years', () => {
    expect(dayKey(addMonths(new Date(2026, 11, 20), 1))).toBe('2027-01-01')
    expect(dayKey(addMonths(new Date(2026, 0, 31), -1))).toBe('2025-12-01')
  })
})
