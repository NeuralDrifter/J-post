// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { buildDocx } from '@reactive-resume/docx'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { newResumeData } from './document'
import { letterPageData, newLetterData } from './letter'

/** The text of word/document.xml inside a .docx. */
async function documentXml(docx: Blob): Promise<string> {
  const files = unzipSync(new Uint8Array(await docx.arrayBuffer()))
  const xml = files['word/document.xml']
  if (!xml) throw new Error('no word/document.xml in the .docx')
  return strFromU8(xml)
}

describe('Word export', () => {
  it('writes a resume with its name and work history', async () => {
    const resume = newResumeData('sample', 'onyx')
    const xml = await documentXml(await buildDocx(resume))
    expect(xml).toContain(resume.basics.name)
    expect(xml).toContain(resume.sections.experience.items[0]!.company)
  })

  it('writes a letter with its greeting and body', async () => {
    const letter = { ...newLetterData(newResumeData('sample', 'onyx')), recipientName: 'Dana Reyes', content: '<p>I build reliable systems.</p>' }
    const xml = await documentXml(await buildDocx(letterPageData(letter)))
    expect(xml).toContain('Dear Dana,')
    expect(xml).toContain('I build reliable systems.')
  })
})
