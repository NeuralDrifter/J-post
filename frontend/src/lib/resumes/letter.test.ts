// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { newResumeData } from './document'
import { composedLetter, letterPageData, withLinkedStyle, letterPlainText, newLetterData, parseStoredLetter, serializeLetter, type LetterData } from './letter'

const fromSample = () => newLetterData(newResumeData('sample', 'gengar'))

function structured(overrides: Partial<LetterData> = {}): LetterData {
  return { ...fromSample(), content: '<p>I build things.</p>', recipientName: 'Dana Reyes', recipientCompany: 'Acme', letterDate: '2026-10-10', ...overrides }
}

describe('newLetterData', () => {
  it("copies the resume's sender details and design, not its notes or layout", () => {
    const resume = newResumeData('sample', 'gengar')
    const letter = newLetterData(resume)
    expect(letter.style.basics).toEqual(resume.basics)
    expect(letter.style.metadata.template).toBe('gengar')
    expect(letter.style.metadata).not.toHaveProperty('notes')
    expect(letter.style.metadata).not.toHaveProperty('layout')
    expect(letter.layout).toBe('structured')
  })

  it('starts blank without a resume', () => {
    const letter = newLetterData(null)
    expect(letter.style.basics.name).toBe('')
    expect(letter.content).toBe('')
  })
})

describe('composedLetter', () => {
  it('greets the recipient by first name, dates the letter and signs off with the sender', () => {
    const { recipient, content } = composedLetter(structured())
    expect(recipient).toContain('Dana Reyes<br />Acme')
    expect(recipient).toContain('October 10, 2026')
    expect(content).toContain('<p>Dear Dana,</p>')
    expect(content).toContain('<p>I build things.</p>')
    expect(content).toMatch(/Kind regards,<br \/>.+<\/p>$/)
  })

  it('greets the hiring team when there is no name', () => {
    const { recipient, content } = composedLetter(structured({ recipientName: '' }))
    expect(recipient).toContain('Hiring team')
    expect(content).toContain('<p>Dear hiring team,</p>')
  })

  it('keeps freeform letters exactly as written', () => {
    const letter = structured({ layout: 'freeform', recipient: '<p>To whom</p>', content: '<p>Body</p>' })
    expect(composedLetter(letter)).toEqual({ recipient: '<p>To whom</p>', content: '<p>Body</p>' })
  })
})

describe('letterPageData', () => {
  it('is a one-section document holding the composed letter on the letter design', () => {
    const page = letterPageData(structured())
    expect(page.customSections).toHaveLength(1)
    expect(page.customSections[0]!.type).toBe('cover-letter')
    expect(page.metadata.template).toBe('gengar')
  })
})

describe('letterPlainText', () => {
  it('reads as the letter: recipient, greeting, body', () => {
    const text = letterPlainText(structured())
    expect(text).toContain('Acme')
    expect(text).toContain('Dear Dana,')
    expect(text).toContain('I build things.')
  })
})

describe('parseStoredLetter', () => {
  it('reads back what serializeLetter wrote', () => {
    const letter = structured()
    expect(parseStoredLetter(serializeLetter(letter))).toEqual({ ok: true, data: letter })
  })

  it('reports data that is not a letter', () => {
    const parsed = parseStoredLetter(JSON.stringify({ format: 'something-else' }))
    expect(parsed.ok).toBe(false)
  })
})

describe('a letter following its resume', () => {
  const resume = { ...newResumeData('sample', 'onyx'), basics: { ...newResumeData('sample', 'onyx').basics, name: 'Ada Lovelace' } }
  const letter = newLetterData(newResumeData('blank', 'kakuna'))

  it('takes the sender details from the resume', () => {
    const linked = withLinkedStyle(letter, resume, { sender: true, design: false })
    expect(linked.style.basics.name).toBe('Ada Lovelace')
    expect(linked.style.metadata.template).toBe('kakuna')
  })

  it('takes the design from the resume', () => {
    const linked = withLinkedStyle(letter, resume, { sender: false, design: true })
    expect(linked.style.metadata.template).toBe('onyx')
    expect(linked.style.basics.name).toBe(letter.style.basics.name)
  })

  it('keeps its own copy when it follows nothing', () => {
    expect(withLinkedStyle(letter, resume, { sender: false, design: false })).toBe(letter)
  })
})
