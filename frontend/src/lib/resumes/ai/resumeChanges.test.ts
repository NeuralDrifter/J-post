// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { sampleResumeData } from '@reactive-resume/schema/resume/sample'
import type { app } from '../../backend'
import type { ResumeData } from '../document'
import type { Change } from './changes'
import { compileResumeGeneration, resumePassages } from './resumeChanges'

const data = sampleResumeData as ResumeData
const passages = resumePassages(data)
const bullet = passages.find((p) => p.target.sectionId === 'experience' && p.location.endsWith('bullet 1'))!
const skills = data.sections.skills.items

function generation(edits: unknown[], decisions: Record<string, string> = {}): app.AIGeneration {
  return {
    id: 'g1', documentId: 'd', task: 'resumeTailor', sectionKey: '', jobId: '', posting: '', provider: 'anthropic', model: 'm',
    context: JSON.stringify({ passages }), edits: JSON.stringify({ edits }), decisions: JSON.stringify(decisions), createdAt: '',
  } as app.AIGeneration
}

const applyAll = (doc: ResumeData, changes: Change<ResumeData>[]) =>
  produce(doc, (draft) => {
    for (const change of changes) change.apply(draft)
  })

describe('rewrite', () => {
  const gen = generation([{ kind: 'rewrite', passageId: bullet.id, text: 'Shipped [x] titles', why: 'a result', addsFacts: true }])

  it('is pending, with the passage before and the rewrite after', () => {
    const [change] = compileResumeGeneration(data, gen).changes
    expect(change).toMatchObject({ key: 'g1:0', sectionId: 'experience', before: bullet.text, after: 'Shipped [x] titles', addsFacts: true, status: 'pending' })
  })

  it('reads as accepted once applied, and goes back to pending when undone', () => {
    const [change] = compileResumeGeneration(data, gen).changes
    const edited = applyAll(data, [change])
    const accepted = generation([{ kind: 'rewrite', passageId: bullet.id, text: 'Shipped [x] titles', why: '' }], { 'g1:0': 'accepted' })
    expect(compileResumeGeneration(edited, accepted).changes[0].status).toBe('accepted')
    expect(compileResumeGeneration(data, accepted).changes[0].status).toBe('pending')
  })

  it('is out of date when the passage was edited since', () => {
    const edited = produce(data, (draft) => {
      const item = draft.sections.experience.items[0]
      item.description = item.description.replace(bullet.html, '<li><p>Something else</p></li>')
    })
    expect(compileResumeGeneration(edited, gen).changes[0].status).toBe('stale')
  })
})

describe('edits that do not fit', () => {
  it('drops unknown ids, malformed edits and no-op rewrites', () => {
    const gen = generation([
      { kind: 'rewrite', passageId: 'p_gone', text: 'x', why: '' },
      { kind: 'teleport' },
      { kind: 'rewrite', passageId: bullet.id, text: bullet.text, why: '' },
      { kind: 'hideItem', sectionId: 'experience', itemId: 'nope', why: '' },
      { kind: 'orderSkills', itemIds: [skills[0].id], why: '' },
    ])
    expect(compileResumeGeneration(data, gen)).toEqual({ changes: [], dropped: 5 })
  })
})

describe('structural edits', () => {
  it('reorders skills, keeping the unmentioned ones after', () => {
    const gen = generation([{ kind: 'orderSkills', itemIds: [skills[2].id, skills[0].id], why: 'posting asks for it' }])
    const [change] = compileResumeGeneration(data, gen).changes
    const after = applyAll(data, [change]).sections.skills.items.map((s) => s.id)
    expect(after).toEqual([skills[2].id, skills[0].id, ...skills.slice(1).filter((s) => s.id !== skills[2].id).map((s) => s.id)])
    expect(compileResumeGeneration(applyAll(data, [change]), gen).changes[0].status).toBe('accepted')
  })

  it('adds a skill once', () => {
    const gen = generation([{ kind: 'addSkill', name: 'Kubernetes', keywords: ['Helm'], why: '' }])
    const [change] = compileResumeGeneration(data, gen).changes
    expect(change.after).toBe('Kubernetes: Helm')
    const once = applyAll(data, [change])
    expect(once.sections.skills.items.at(-1)).toMatchObject({ name: 'Kubernetes', keywords: ['Helm'] })
    expect(applyAll(once, [change]).sections.skills.items).toHaveLength(once.sections.skills.items.length)
  })

  it('hides an entry and sets the headline', () => {
    const item = data.sections.experience.items[0]
    const gen = generation([
      { kind: 'hideItem', sectionId: 'experience', itemId: item.id, why: 'not relevant' },
      { kind: 'setHeadline', text: 'Senior Engine Programmer', why: '' },
    ])
    const changed = applyAll(data, compileResumeGeneration(data, gen).changes)
    expect(changed.sections.experience.items[0].hidden).toBe(true)
    expect(changed.basics.headline).toBe('Senior Engine Programmer')
  })

  it('keeps a rejection', () => {
    const gen = generation([{ kind: 'setHeadline', text: 'Other', why: '' }], { 'g1:0': 'rejected' })
    expect(compileResumeGeneration(data, gen).changes[0].status).toBe('rejected')
  })

  it("replaces a section with entries that fit the section's shape", () => {
    const gen = generation([{ kind: 'replaceSection', sectionId: 'languages', items: [{ language: 'Welsh', fluency: 'Native', level: 5 }], why: '' }])
    const [change] = compileResumeGeneration(data, gen).changes
    expect(change.after).toContain('Welsh')
    expect(applyAll(data, [change]).sections.languages.items).toMatchObject([{ language: 'Welsh', fluency: 'Native' }])
    const bad = generation([{ kind: 'replaceSection', sectionId: 'languages', items: [{ language: 7 }], why: '' }])
    expect(compileResumeGeneration(data, bad).dropped).toBe(1)
  })
})
