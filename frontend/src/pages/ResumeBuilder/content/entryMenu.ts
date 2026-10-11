// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { ArrowRight, FilePlus2, FileText, Plus } from 'lucide-react'
import type { WriteSection } from '@reactive-resume/web/features/resume/editor/write/model'
import { getCompatibleMoveTargets, getSourceSectionTitle, moveItem } from '@reactive-resume/web/libs/resume/move-item'
import type { MenuEntry } from '../../../lib/menu'
import type { ResumeData } from '../../../lib/resumes/document'

/** Where an entry can go: a section of the same kind, a new section on a page, or a new page. */
export type MoveTarget = Parameters<typeof moveItem>[1]['target']

/** The recipe that moves one entry. Custom sections the move leaves empty are removed, as upstream does. */
export const moveEntry =
  (section: WriteSection, entryId: string, target: MoveTarget) =>
  (draft: ResumeData): void =>
    moveItem(draft, { itemId: entryId, type: section.type, customSectionId: customIdOf(section), target })

const customIdOf = (section: WriteSection) => (section.kind === 'custom' ? section.id : undefined)

/** "Move to…": per page, the sections of the same kind and a new section; then a new page. */
export function moveToMenu(data: ResumeData, section: WriteSection, move: (target: MoveTarget) => void): MenuEntry {
  const pages = getCompatibleMoveTargets(data, section.type, customIdOf(section))
  const title = getSourceSectionTitle(data, section.type, customIdOf(section))
  const pageMenu = ({ pageIndex, sections }: (typeof pages)[number]): MenuEntry => ({
    label: `Page ${pageIndex + 1}`,
    icon: FileText,
    submenu: [
      ...sections.map(({ sectionId, sectionTitle }): MenuEntry => ({ label: sectionTitle, onSelect: () => move({ type: 'section', sectionId }) })),
      ...(sections.length > 0 ? (['separator'] as const) : []),
      { label: 'New section', icon: Plus, onSelect: () => move({ type: 'new-section', title, pageIndex }) },
    ],
  })
  return {
    label: 'Move to…',
    icon: ArrowRight,
    submenu: [...pages.map(pageMenu), 'separator', { label: 'New page', icon: FilePlus2, onSelect: () => move({ type: 'new-page', title }) }],
  }
}
