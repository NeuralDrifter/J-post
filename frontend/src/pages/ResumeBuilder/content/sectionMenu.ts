// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// A section's options menu. Behaviour follows Reactive Resume's section row
// (apps/web/src/features/resume/editor/write/section-row.tsx, MIT).
import type { Draft } from 'immer'
import { ArrowDown, ArrowUp, CalendarArrowDown, Columns3, Eraser, Eye, EyeOff, FileStack, Heading, List, Pencil, Plus, Rows3, Trash2 } from 'lucide-react'
import type { ResumeData } from '@reactive-resume/schema/resume/data'
import { sortSectionItemsByPeriod } from '@reactive-resume/resume/section-sort'
import { createEntry, getEntries, getSectionObject, moveSection, type OutlineRow, type WriteSection } from '@reactive-resume/web/features/resume/editor/write/model'
import { promptDialog } from '../../../components/ConfirmDialog'
import type { MenuEntry } from '../../../lib/menu'
import { toast } from '../../../lib/toast'

type Update = (recipe: (draft: Draft<ResumeData>) => void) => void
type SectionSettings = NonNullable<ReturnType<typeof getSectionObject>>

export type SectionMenuContext = {
  section: WriteSection
  settings: SectionSettings
  title: string
  /** The rows above and below it in the outline, for Move up / Move down. */
  previous?: OutlineRow
  next?: OutlineRow
  update: Update
  onEntryAdded: (entryId: string) => void
}

const COLUMN_CHOICES = [1, 2, 3, 4, 5, 6] as const

const CHECKED = '  ✓'

export function sectionMenu(ctx: SectionMenuContext): MenuEntry[] {
  const { section, settings, previous, next } = ctx
  const edit = (mutate: (target: Draft<SectionSettings>) => void) =>
    ctx.update((draft) => {
      const target = getSectionObject(draft, section)
      if (target) mutate(target as Draft<SectionSettings>)
    })
  const hasEntries = section.kind !== 'summary'
  const canSort = section.type === 'experience' || section.type === 'education'

  return [
    ...(hasEntries ? [{ label: 'Add entry', icon: Plus, onSelect: () => addEntry(ctx) }] : []),
    ...(canSort ? [{ label: 'Sort by date', icon: CalendarArrowDown, onSelect: () => sortByDate(ctx) }] : []),
    { label: 'Move up', icon: ArrowUp, disabled: !previous, onSelect: () => previous && ctx.update((d) => moveSection(d, section.id, previous, 'up')) },
    { label: 'Move down', icon: ArrowDown, disabled: !next, onSelect: () => next && ctx.update((d) => moveSection(d, section.id, next, 'down')) },
    'separator',
    { label: 'Rename…', icon: Pencil, onSelect: () => rename(ctx, edit) },
    columnsMenu(ctx, edit),
    ...(section.type === 'skills' ? [keywordLayoutMenu(ctx, edit)] : []),
    { label: settings.showHeading === false ? 'Show heading' : 'Hide heading', icon: Heading, onSelect: () => edit((s) => void (s.showHeading = settings.showHeading === false)) },
    { label: settings.keepTogether ? 'Allow splitting across pages' : 'Keep on one page', icon: Rows3, onSelect: () => edit((s) => void (s.keepTogether = !settings.keepTogether)) },
    { label: settings.startOnNewPage ? "Don't start on a new page" : 'Start on a new page', icon: FileStack, onSelect: () => edit((s) => void (s.startOnNewPage = !settings.startOnNewPage)) },
    { label: settings.hidden ? 'Show on the page' : 'Hide from the page', icon: settings.hidden ? Eye : EyeOff, onSelect: () => edit((s) => void (s.hidden = !settings.hidden)) },
    'separator',
    section.kind === 'custom'
      ? { label: 'Delete section', icon: Trash2, danger: true, onSelect: () => deleteCustomSection(ctx) }
      : { label: 'Clear section', icon: Eraser, danger: true, onSelect: () => clearSection(ctx, edit) },
  ]
}

type Edit = (mutate: (target: Draft<SectionSettings>) => void) => void

/** Skills settings: an inline layout (fields beside the name) and how keywords print. */
type SkillsSettings = { layout?: 'default' | 'inline'; keywordLayout?: 'inline' | 'list' }

/** 1 to 6 columns; skills can also sit inline in one column. */
function columnsMenu({ section, settings }: SectionMenuContext, edit: Edit): MenuEntry {
  const isSkills = section.type === 'skills'
  const inline = isSkills && (settings as SkillsSettings).layout === 'inline'
  const setColumns = (n: number, layout: 'default' | 'inline') =>
    edit((s) => {
      s.columns = n
      if (isSkills) (s as SkillsSettings).layout = layout
    })
  return {
    label: 'Columns',
    icon: Columns3,
    submenu: [
      ...COLUMN_CHOICES.map((n) => ({ label: `${n} column${n > 1 ? 's' : ''}${!inline && settings.columns === n ? CHECKED : ''}`, onSelect: () => setColumns(n, 'default') })),
      ...(isSkills ? [{ label: `1 column, inline${inline ? CHECKED : ''}`, onSelect: () => setColumns(1, 'inline') }] : []),
    ],
  }
}

/** Skill keywords: inline with commas, or one bullet each. */
function keywordLayoutMenu({ settings }: SectionMenuContext, edit: Edit): MenuEntry {
  const current = (settings as SkillsSettings).keywordLayout ?? 'inline'
  const choose = (layout: 'inline' | 'list') => edit((s) => void ((s as SkillsSettings).keywordLayout = layout))
  return {
    label: 'Keyword layout',
    icon: List,
    submenu: [
      { label: `Inline${current === 'inline' ? CHECKED : ''}`, onSelect: () => choose('inline') },
      { label: `Bulleted list${current === 'list' ? CHECKED : ''}`, onSelect: () => choose('list') },
    ],
  }
}

function addEntry({ section, update, onEntryAdded }: SectionMenuContext) {
  const entry = createEntry(section.type)
  update((draft) => void getEntries(draft, section).push(entry))
  onEntryAdded(entry.id)
}

function sortByDate({ section, update, title }: SectionMenuContext) {
  let unsorted = 0
  update((draft) => {
    const entries = getEntries(draft, section) as unknown as { id: string; period: string }[]
    const result = sortSectionItemsByPeriod(entries, draft.metadata.page.locale)
    unsorted = result.unresolvedIds.length
    entries.splice(0, entries.length, ...result.items)
  })
  if (unsorted > 0) toast.info(`${unsorted} ${title} entries have no readable dates and stayed at the end.`)
}

async function rename({ settings }: SectionMenuContext, edit: (mutate: (s: Draft<SectionSettings>) => void) => void) {
  const name = await promptDialog({ title: 'Rename section', label: 'Title (leave empty for the default)', initial: settings.title, confirmLabel: 'Rename' })
  if (name !== null) edit((s) => void (s.title = name))
}

function clearSection({ title }: SectionMenuContext, edit: (mutate: (s: Draft<SectionSettings>) => void) => void) {
  edit((s) => {
    if ('items' in s) s.items = []
    else s.content = ''
  })
  toast.info(`${title} cleared. Ctrl+Z undoes it.`)
}

function deleteCustomSection({ section, update, title }: SectionMenuContext) {
  update((draft) => {
    draft.customSections = draft.customSections.filter((custom) => custom.id !== section.id)
    for (const page of draft.metadata.layout.pages) {
      page.main = page.main.filter((id) => id !== section.id)
      page.sidebar = page.sidebar.filter((id) => id !== section.id)
    }
  })
  toast.info(`${title} deleted. Ctrl+Z undoes it.`)
}
