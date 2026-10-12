// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { newResumeData, serializeResume } from './document'
import { detectImportKind, docxText, ImportError, readImport, summarizeImport } from './importFile'
import { newLetterData, serializeLetter } from './letter'

const text = (s: string) => strToU8(s)
const json = (value: unknown) => text(JSON.stringify(value))

const jsonResume = {
  basics: { name: 'Grace Hopper', label: 'Rear Admiral', email: 'grace@navy.mil' },
  work: [{ name: 'US Navy', position: 'Computer Scientist', startDate: '1943-12', summary: 'Wrote the first compiler.' }],
}

function docx(paragraphs: string[]): Uint8Array {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('')
  return zipSync({ 'word/document.xml': text(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`) })
}

describe('detectImportKind', () => {
  it('reads the kind from bytes and shape, not just the extension', () => {
    expect(detectImportKind('cv.pdf', text('%PDF-1.7 …'))).toBe('pdf')
    expect(detectImportKind('export.bin', text('%PDF-1.4'))).toBe('pdf')
    expect(detectImportKind('cv.docx', docx(['x']))).toBe('docx')
    expect(detectImportKind('Basic_LinkedInDataExport.zip', zipSync({ 'Profile.csv': text('a') }))).toBe('linkedin')
    expect(detectImportKind('cv.json', json(jsonResume))).toBe('json-resume-json')
    expect(detectImportKind('cv.json', json(newResumeData('sample', 'onyx')))).toBe('reactive-resume-json')
    expect(detectImportKind('v4.json', json({ basics: {}, sections: {}, metadata: { layout: [[['summary']]] } }))).toBe('reactive-resume-v4-json')
    expect(detectImportKind('letter.json', json(newLetterData(null)))).toBe('cover-letter-json')
  })

  it('refuses old Word files and account archives with advice', () => {
    expect(() => detectImportKind('cv.doc', text('\xd0\xcf\x11\xe0'))).toThrow(/\.docx/)
    expect(() => detectImportKind('account.zip', zipSync({ 'account.json': text('{}') }))).toThrow(/Extract/)
  })

  it('refuses files that are none of the formats', () => {
    expect(() => detectImportKind('notes.json', json({ hello: 'world' }))).toThrow(ImportError)
    expect(() => detectImportKind('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow(ImportError)
  })
})

describe('readImport', () => {
  it('reads a JSON Resume', async () => {
    const result = await readImport('cv.json', json(jsonResume))
    expect(result.kind).toBe('resume')
    if (result.kind !== 'resume') return
    expect(result.data.basics.name).toBe('Grace Hopper')
    expect(result.data.sections.experience.items[0]).toMatchObject({ company: 'US Navy', position: 'Computer Scientist' })
  })

  it('reads a Reactive Resume export as it was saved', async () => {
    const original = newResumeData('sample', 'lapras')
    const result = await readImport('cv.json', text(serializeResume(original)))
    expect(result.kind === 'resume' && result.data.metadata.template).toBe('lapras')
  })

  it('splits cover letters out of an older resume into letters', async () => {
    const resume = newResumeData('sample', 'onyx')
    resume.customSections.push({ id: 'cl', type: 'cover-letter', title: 'To Acme', icon: '', columns: 1, hidden: false, showHeading: true, keepTogether: false, startOnNewPage: false, items: [{ id: 'i', hidden: false, recipient: '<p>Acme</p>', content: '<p>Hello</p>' }] } as never)
    resume.metadata.layout.pages[0]!.main.push('cl')
    const result = await readImport('cv.json', json(resume))
    if (result.kind !== 'resume') throw new Error('expected a resume')
    expect(result.data.customSections.some((s) => s.type === 'cover-letter')).toBe(false)
    expect(result.letters).toHaveLength(1)
    expect(result.letters[0]).toMatchObject({ layout: 'freeform', recipient: '<p>Acme</p>', content: '<p>Hello</p>' })
  })

  it('reads a Reactive Resume cover letter', async () => {
    const letter = { ...newLetterData(null), content: '<p>Dear team</p>' }
    const result = await readImport('letter.json', text(serializeLetter(letter)))
    expect(result).toEqual({ kind: 'letter', letter })
  })

  it('reads a Word resume through its text', async () => {
    const result = await readImport('cv.docx', docx(['Ada Lovelace', 'ada@example.com', 'Experience', 'Analyst, Babbage & Co', '1842 - 1843']))
    expect(result.kind === 'resume' && result.data.basics.name).toBe('Ada Lovelace')
    expect(result.kind === 'resume' && result.sourceText).toContain('Analyst, Babbage & Co')
  })
})

describe('docxText', () => {
  it('reads paragraphs in order, unescaping XML', () => {
    expect(docxText(docx(['First line', 'R&amp;D &lt;team&gt;']))).toBe('First line\nR&D <team>')
  })
})

describe('summarizeImport', () => {
  it('counts sections with content, their entries and dates to check', () => {
    const data = newResumeData('sample', 'onyx')
    const summary = summarizeImport(data)
    expect(summary.sections).toBeGreaterThan(1)
    expect(summary.entries).toBeGreaterThan(1)
    expect(summary.datesToCheck).toBe(0)
  })
})
