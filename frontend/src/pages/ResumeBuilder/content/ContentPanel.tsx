// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Plus } from 'lucide-react'
import { getResumeSectionTitle } from '@reactive-resume/pdf/section-title'
import type { CustomSectionType, SectionType } from '@reactive-resume/schema/resume/data'
import {
  addBuiltinSection,
  addCustomSection,
  BUILTIN_SECTION_TYPES,
  CUSTOM_SECTION_TYPES,
  getOutlineRows,
  isSectionInUse,
  resolveSection,
} from '@reactive-resume/web/features/resume/editor/write/model'
import { openMenu, type MenuEntry } from '../../../lib/menu'
import { useResume, useUpdate } from '../editorContext'
import { useBuilderView, type EditorSelection } from '../viewStore'
import { BasicsCard } from './BasicsCard'
import { EntryModal } from './EntryModal'
import { PictureCard } from './PictureCard'
import { SectionCard } from './SectionCard'
import { SECTION_ICONS } from './sectionIcons'

type OpenEntry = { sectionId: string; entryId: string }

/** Everything the resume says: basics, photo, and each section in print order. */
export function ContentPanel() {
  const data = useResume()
  const update = useUpdate()
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set())
  // Sections added this visit stay listed even while still empty.
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const [openEntry, setOpenEntry] = useState<OpenEntry | null>(null)
  const rows = getOutlineRows(data, added)

  const toggle = (id: string) => setOpenSections((open) => withToggled(open, id))
  const reveal = (id: string) => {
    setAdded((ids) => new Set(ids).add(id))
    setOpenSections((open) => new Set(open).add(id))
  }
  useRevealSelection((selection) => {
    if (selection.kind === 'header') return scrollToBlock('header')
    reveal(selection.sectionId)
    if (selection.kind === 'item') setOpenEntry({ sectionId: selection.sectionId, entryId: selection.itemId })
    else scrollToBlock(selection.sectionId)
  })
  const closeEntry = () => {
    setOpenEntry(null)
    useBuilderView.getState().select(null)
  }
  const openNewEntry = (sectionId: string, entryId: string | null) => {
    reveal(sectionId)
    if (entryId) setOpenEntry({ sectionId, entryId })
  }

  const addBuiltin = (type: 'summary' | SectionType) => {
    let entryId: string | null = null
    update((draft) => void (entryId = addBuiltinSection(draft, type)))
    openNewEntry(type, entryId)
  }
  const addCustom = (type: CustomSectionType) => {
    let created = { sectionId: '', entryId: '' }
    update((draft) => void (created = addCustomSection(draft, type, getResumeSectionTitle(data, type))))
    openNewEntry(created.sectionId, created.entryId)
  }
  const showAddMenu = (e: MouseEvent) => openMenu(e, addSectionMenu(data, added, addBuiltin, addCustom))

  return (
    <div className="space-y-2.5">
      <BasicsCard />
      <PictureCard />
      {rows.map((row, index) => {
        const section = resolveSection(data, row.id)
        if (!section) return null
        return (
          <SectionCard
            key={row.id}
            section={section}
            open={openSections.has(row.id)}
            onToggle={() => toggle(row.id)}
            previous={rows[index - 1]}
            next={rows[index + 1]}
            onOpenEntry={(sectionId, entryId) => setOpenEntry({ sectionId, entryId })}
          />
        )
      })}
      <button type="button" className="btn btn-ghost w-full border-dashed" onClick={showAddMenu}>
        <Plus size={15} /> Add section
      </button>
      {openEntry && (
        <EntryModal
          sectionId={openEntry.sectionId}
          entryId={openEntry.entryId}
          sectionTitle={getResumeSectionTitle(data, openEntry.sectionId)}
          onClose={closeEntry}
        />
      )}
    </div>
  )
}

/** Runs `reveal` each time a block is picked on the page (or by a Check fix), so its fields come into view. */
function useRevealSelection(reveal: (selection: EditorSelection) => void) {
  const selection = useBuilderView((s) => s.selection)
  const latest = useRef(reveal)
  latest.current = reveal
  useEffect(() => {
    if (selection) latest.current(selection)
  }, [selection])
}

/** Scrolls the panel to a block's card: "header" for the basics, else a section id. */
function scrollToBlock(block: string) {
  requestAnimationFrame(() => {
    document.querySelector(`[data-block="${CSS.escape(block)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })
}

function withToggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set)
  if (!next.delete(id)) next.add(id)
  return next
}

/** Unused built-in sections, then a custom section of any kind. */
function addSectionMenu(
  data: ReturnType<typeof useResume>,
  added: ReadonlySet<string>,
  addBuiltin: (type: 'summary' | SectionType) => void,
  addCustom: (type: CustomSectionType) => void,
): MenuEntry[] {
  const unused = (['summary', ...BUILTIN_SECTION_TYPES] as const).filter((id) => !isSectionInUse(data, id, added))
  return [
    ...unused.map((type) => ({ label: getResumeSectionTitle(data, type), icon: SECTION_ICONS[type], onSelect: () => addBuiltin(type) })),
    ...(unused.length ? (['separator'] as const) : []),
    {
      label: 'Custom section',
      icon: Plus,
      submenu: CUSTOM_SECTION_TYPES.map((type) => ({ label: `Like ${getResumeSectionTitle(data, type)}`, icon: SECTION_ICONS[type], onSelect: () => addCustom(type) })),
    },
  ]
}
