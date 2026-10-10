// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app } from './backend'
import { buildCalendar, csvCell, exportFileName, jobsToCsv } from './exportFiles'

describe('csvCell', () => {
  it('quotes cells with commas, quotes or line breaks', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('defuses cells a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1 555')).toBe("'+1 555")
  })
})

describe('jobsToCsv', () => {
  const job = { company: 'Acme, Inc', position: 'Engineer', status: 'applied', closeReason: '', location: 'Remote', workMode: 'remote', salaryMin: 100000, salaryMax: 150000, salaryText: '', url: 'https://acme.example/job', source: 'manual', datePosted: '', dateApplied: '2026-10-01', followUpOn: '', notes: '', createdAt: '2026-09-30T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' } as app.Job

  it('writes a header and one row per job, with a BOM for spreadsheets', () => {
    const csv = jobsToCsv([job])
    const [header, row] = csv.replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(header).toBe('Company,Position,Stage,Closed because,Location,Work mode,Salary,URL,Source,Posted,Applied,Follow up on,Added,Last changed,Notes')
    expect(row).toContain('"Acme, Inc",Engineer,Applied,')
    expect(row).toContain('100000–150000')
  })
})

describe('buildCalendar', () => {
  it('writes one VEVENT per interview, in UTC, escaped and folded', () => {
    const ics = buildCalendar(
      [
        { uid: 'iv1', title: 'Onsite, Acme', start: new Date('2026-10-12T16:00:00Z'), minutes: 60, location: 'HQ; 4th floor', description: 'Bring ID' },
        { uid: 'iv2', title: 'Phone screen', start: new Date('2026-10-13T15:30:00Z'), minutes: 30 },
      ],
      new Date('2026-10-10T00:00:00Z'),
    )
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(lines).toContain('DTSTART:20261012T160000Z')
    expect(lines).toContain('DTEND:20261012T170000Z')
    expect(lines).toContain('SUMMARY:Onsite\\, Acme')
    expect(lines).toContain('LOCATION:HQ\\; 4th floor')
    expect(lines.every((l) => l.length <= 75)).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})

describe('exportFileName', () => {
  it('turns the document name into a safe file name', () => {
    expect(exportFileName('Backend: Acme / 2026', 'pdf')).toBe('Backend Acme 2026.pdf')
    expect(exportFileName('   ', 'json')).toBe('Document.json')
  })
})
