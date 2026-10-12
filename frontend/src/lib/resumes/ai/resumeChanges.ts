// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Turns a resume generation's edits into changes against the resume as it is now.

import { getResumeSectionTitle } from '@reactive-resume/pdf/section-title'
import { blockText, collectPassages, readTarget, writeTarget, type Passage } from '@reactive-resume/resume/proposals'
import { customSectionItemDefinitionByType, type SectionType } from '@reactive-resume/schema/resume/data'
import { createEntry, describeEntry, findEntry, getSectionType, type Entry } from '@reactive-resume/web/features/resume/editor/write/model'
import type { app } from '../../backend'
import type { ResumeData } from '../document'
import { changeKey, parseDecisions, structuralStatus, textChange, type Change, type Compiled, type Decisions, type TextField } from './changes'
import { parseEdits, type Edit, type EditOf } from './edits'

/** What the builder keeps with a run: the passages it sent, so their ids still resolve after the text changes. */
export type ResumeContext = { passages: Passage[] }

export const BASICS_SECTION = 'basics'
const SKILLS: SectionType = 'skills'

/** Every passage of the resume an edit can name, labelled as the outline names them. */
export function resumePassages(data: ResumeData): Passage[] {
  return collectPassages(data, {
    summary: getResumeSectionTitle(data, 'summary'),
    sectionTitle: (id) => getResumeSectionTitle(data, id),
    entryTitle: (type, entry) => describeEntry(type as never, entry as Entry).title,
    bullet: (n) => `bullet ${n}`,
    paragraph: (n) => `paragraph ${n}`,
  })
}

export const sectionTitle = (data: ResumeData, sectionId: string) => (sectionId === BASICS_SECTION ? 'Basics' : getResumeSectionTitle(data, sectionId))

const resumeField: TextField<ResumeData> = {
  read: (doc, passage) => readTarget(doc, passage.target),
  write: (draft, passage, value) => writeTarget(draft as ResumeData, passage.target, value),
}

export function parseResumeContext(json: string): ResumeContext {
  try {
    const parsed = JSON.parse(json) as Partial<ResumeContext>
    return { passages: Array.isArray(parsed.passages) ? parsed.passages : [] }
  } catch {
    return { passages: [] }
  }
}

/** The generation's changes, and how many of its edits no longer fit the resume (or never made sense). */
export function compileResumeGeneration(data: ResumeData, gen: app.AIGeneration): Compiled<ResumeData> {
  const { passages } = parseResumeContext(gen.context)
  const byId = new Map(passages.map((p) => [p.id, p]))
  const decisions = parseDecisions(gen.decisions)
  const changes: Change<ResumeData>[] = []
  let dropped = 0
  parseEdits(gen.edits).forEach((edit, index) => {
    const change = edit && compileEdit({ data, gen, index, decisions, byId }, edit)
    if (change) changes.push(change)
    else dropped++
  })
  return { changes, dropped }
}

type Ctx = { data: ResumeData; gen: app.AIGeneration; index: number; decisions: Decisions; byId: Map<string, Passage> }

function compileEdit(ctx: Ctx, edit: Edit): Change<ResumeData> | null {
  switch (edit.kind) {
    case 'rewrite':
    case 'addAfter': {
      const passage = ctx.byId.get(edit.passageId)
      return passage ? textChange(ctx.data, ctx.gen, ctx.index, edit, passage, resumeField, ctx.decisions) : null
    }
    case 'setHeadline':
      return headlineChange(ctx, edit)
    case 'orderSkills':
      return orderSkillsChange(ctx, edit)
    case 'addSkill':
      return addSkillChange(ctx, edit)
    case 'hideItem':
      return hideItemChange(ctx, edit)
    case 'replaceSection':
      return replaceSectionChange(ctx, edit)
    case 'setBody':
      return null // letters only
  }
}

/** The fields every structural change shares. */
function base(ctx: Ctx, sectionId: string, location: string, why: string) {
  const key = changeKey(ctx.gen.id, ctx.index)
  return { key, generationId: ctx.gen.id, sectionId, location, why, addsFacts: false, decision: ctx.decisions[key] }
}

function headlineChange(ctx: Ctx, edit: EditOf<'setHeadline'>): Change<ResumeData> | null {
  const text = edit.text.trim()
  const current = ctx.data.basics.headline
  if (!text) return null
  const { decision, ...shared } = base(ctx, BASICS_SECTION, 'Basics · Headline', edit.why)
  return {
    ...shared,
    before: current === text ? '' : current,
    after: text,
    status: structuralStatus(decision, current === text, true),
    apply: (draft) => {
      draft.basics.headline = text
      return true
    },
  }
}

const skillNames = (items: readonly { id: string; name: string }[], ids: readonly string[]) =>
  ids.map((id) => items.find((s) => s.id === id)?.name ?? '').filter(Boolean)

/** The skills in the suggested order; skills it didn't mention keep their order, after the ones it did. */
function reorderSkills<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
  const listed = order.map((id) => items.find((s) => s.id === id)).filter((s): s is T => Boolean(s))
  return [...listed, ...items.filter((s) => !order.includes(s.id))]
}

function orderSkillsChange(ctx: Ctx, edit: EditOf<'orderSkills'>): Change<ResumeData> | null {
  const items = ctx.data.sections.skills.items
  const order = edit.itemIds.filter((id) => items.some((s) => s.id === id))
  if (order.length < 2) return null
  const current = items.map((s) => s.id)
  const target = reorderSkills(items, order).map((s) => s.id)
  const { decision, ...shared } = base(ctx, SKILLS, `${sectionTitle(ctx.data, SKILLS)} · order`, edit.why)
  return {
    ...shared,
    before: skillNames(items, current).join(' · '),
    after: skillNames(items, target).join(' · '),
    status: structuralStatus(decision, current.join() === target.join(), true),
    apply: (draft) => {
      draft.sections.skills.items = reorderSkills(draft.sections.skills.items, order)
      return true
    },
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function addSkillChange(ctx: Ctx, edit: EditOf<'addSkill'>): Change<ResumeData> | null {
  const name = edit.name.trim()
  if (!name) return null
  const keywords = edit.keywords.map((k) => k.trim()).filter(Boolean)
  const exists = (data: ResumeData) => data.sections.skills.items.some((s) => sameName(s.name, name))
  const { decision, ...shared } = base(ctx, SKILLS, `${sectionTitle(ctx.data, SKILLS)} · new skill`, edit.why)
  return {
    ...shared,
    before: '',
    after: keywords.length ? `${name}: ${keywords.join(', ')}` : name,
    status: structuralStatus(decision, exists(ctx.data), true),
    apply: (draft) => {
      if (exists(draft as ResumeData)) return false
      draft.sections.skills.items.push({ ...createEntry('skills'), name, keywords } as never)
      return true
    },
  }
}

function hideItemChange(ctx: Ctx, edit: EditOf<'hideItem'>): Change<ResumeData> | null {
  const entry = findEntry(ctx.data, edit.sectionId, edit.itemId)
  const type = getSectionType(ctx.data, edit.sectionId)
  if (!entry || !type) return null
  const title = describeEntry(type, entry).title || 'entry'
  const { decision, ...shared } = base(ctx, edit.sectionId, `${sectionTitle(ctx.data, edit.sectionId)} · ${title}`, edit.why)
  return {
    ...shared,
    before: title,
    after: '',
    status: structuralStatus(decision, entry.hidden, true),
    apply: (draft) => {
      const target = findEntry(draft as ResumeData, edit.sectionId, edit.itemId)
      if (!target) return false
      target.hidden = true
      return true
    },
  }
}

/** A section's entries as lines of text, for the diff: each entry's title, details and description. */
function entriesText(type: Parameters<typeof describeEntry>[0], items: readonly Entry[]): string {
  return items
    .map((item) => {
      const { title, meta } = describeEntry(type, item)
      const description = typeof (item as { description?: unknown }).description === 'string' ? blockText((item as { description: string }).description) : ''
      return [title, meta, description].filter(Boolean).join(' — ')
    })
    .join('\n')
}

/** The model's entries as valid entries of the section's type; null if any of them isn't. */
function validEntries(type: keyof typeof customSectionItemDefinitionByType, raw: readonly Record<string, unknown>[]): Entry[] | null {
  const schema = customSectionItemDefinitionByType[type].schema
  const entries: Entry[] = []
  for (const item of raw) {
    const parsed = schema.safeParse({ ...createEntry(type), ...item, id: createEntry(type).id, hidden: false })
    if (!parsed.success) return null
    entries.push(parsed.data as Entry)
  }
  return entries
}

function replaceSectionChange(ctx: Ctx, edit: EditOf<'replaceSection'>): Change<ResumeData> | null {
  const sectionId = edit.sectionId as SectionType
  const section = ctx.data.sections[sectionId]
  const type = getSectionType(ctx.data, sectionId)
  if (!section || !type) return null
  const entries = validEntries(type, edit.items)
  if (!entries || entries.length === 0) return null
  const current = entriesText(type, section.items as Entry[])
  const after = entriesText(type, entries)
  const applied = current === after
  const { decision, ...shared } = base(ctx, sectionId, sectionTitle(ctx.data, sectionId), edit.why)
  return {
    ...shared,
    before: applied ? '' : current,
    after,
    status: structuralStatus(decision, applied, true),
    apply: (draft) => {
      ;(draft.sections[sectionId] as { items: Entry[] }).items = entries
      return true
    },
  }
}
