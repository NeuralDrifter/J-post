// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { EyeOff, MoreHorizontal, Plus } from 'lucide-react'
import { getResumeSectionTitle } from '@reactive-resume/pdf/section-title'
import { createEntry, getEntries, getSectionObject, type OutlineRow, type WriteSection } from '@reactive-resume/web/features/resume/editor/write/model'
import { openMenu } from '../../../lib/menu'
import { useResume, useUpdate } from '../editorContext'
import { Collapsible } from '../ui/controls'
import { EntryList } from './EntryList'
import { RichTextField } from './RichTextField'
import { SECTION_ICONS } from './sectionIcons'
import { sectionMenu } from './sectionMenu'

type Props = {
  section: WriteSection
  open: boolean
  onToggle: () => void
  previous?: OutlineRow
  next?: OutlineRow
  onOpenEntry: (sectionId: string, entryId: string) => void
}

/** One section of the outline: its entries (or the summary text) and its options menu. */
export function SectionCard({ section, open, onToggle, previous, next, onOpenEntry }: Props) {
  const data = useResume()
  const update = useUpdate()
  const settings = getSectionObject(data, section)
  if (!settings) return null
  const title = getResumeSectionTitle(data, section.id)
  const Icon = SECTION_ICONS[section.type]
  const count = section.kind === 'summary' ? null : getEntries(data, section).length

  const addEntry = () => {
    const entry = createEntry(section.type)
    update((draft) => void getEntries(draft, section).push(entry))
    onOpenEntry(section.id, entry.id)
  }
  const showMenu = (e: React.MouseEvent) =>
    openMenu(e, sectionMenu({ section, settings, title, previous, next, update, onEntryAdded: (id) => onOpenEntry(section.id, id) }))

  return (
    <div onContextMenu={showMenu}>
      <Collapsible
        title={
          <span className="flex items-center gap-2">
            {title}
            {count !== null && <span className="font-mono text-[11px] font-normal text-ink-3">{count}</span>}
            {settings.hidden && <EyeOff size={12} className="text-ink-3" aria-label="Hidden from the page" />}
          </span>
        }
        icon={<Icon size={15} className="shrink-0 text-indigo-300" />}
        open={open}
        onToggle={onToggle}
        actions={
          <button type="button" onClick={showMenu} aria-label={`Options for ${title}`} className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-white/10 hover:text-ink">
            <MoreHorizontal size={15} />
          </button>
        }
      >
        {section.kind === 'summary' ? (
          <RichTextField label="Summary" html={data.summary.content} onChange={(html) => update((d) => void (d.summary.content = html))} minHeight="min-h-36" />
        ) : (
          <>
            <EntryList section={section} onOpen={(entryId) => onOpenEntry(section.id, entryId)} />
            <button type="button" className="btn btn-ghost w-full py-1.5 text-xs" onClick={addEntry}>
              <Plus size={13} /> Add entry
            </button>
          </>
        )}
      </Collapsible>
    </div>
  )
}
