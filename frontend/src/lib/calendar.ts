// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// A month calendar: its weeks (Monday first) and what falls on each day.

/** Six weeks of days, Monday first, covering the month of `month` (the calendar always has six rows). */
export function monthGrid(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day)),
  )
}

/** A day's key in local time, e.g. "2026-10-11". */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Items by the local day they happen on, each day's in time order. */
export function groupByDay<T extends { scheduledAt: string }>(items: readonly T[]): Map<string, T[]> {
  const days = new Map<string, T[]>()
  const sorted = [...items].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
  for (const item of sorted) {
    const key = dayKey(new Date(item.scheduledAt))
    days.set(key, [...(days.get(key) ?? []), item])
  }
  return days
}

/** The first day of the month `offset` months from `month`'s. */
export const addMonths = (month: Date, offset: number) => new Date(month.getFullYear(), month.getMonth() + offset, 1)
