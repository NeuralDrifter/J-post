// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { MouseEvent } from 'react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, Eye, EyeOff, GripVertical, Trash2 } from 'lucide-react'
import { generateId } from '@reactive-resume/utils/string'
import { describeEntry, getEntries, isDraftEntry, type Entry, type WriteSection } from '@reactive-resume/web/features/resume/editor/write/model'
import { Chip } from '../../../components/Chip'
import { openMenu } from '../../../lib/menu'
import { useResume, useUpdate } from '../editorContext'

/** A section's entries: click to edit, drag to reorder, right-click for more. */
export function EntryList({ section, onOpen }: { section: WriteSection; onOpen: (entryId: string) => void }) {
  const data = useResume()
  const update = useUpdate()
  const entries = getEntries(data, section)
  // A small drag distance keeps a plain click a click.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    update((draft) => {
      const list = getEntries(draft, section)
      const from = list.findIndex((e) => e.id === active.id)
      const to = list.findIndex((e) => e.id === over.id)
      list.splice(0, list.length, ...arrayMove(list, from, to))
    })
  }

  if (entries.length === 0) return <p className="px-1 text-xs text-ink-3">No entries yet.</p>
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <EntryRow key={entry.id} section={section} entry={entry} onOpen={() => onOpen(entry.id)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function EntryRow({ section, entry, onOpen }: { section: WriteSection; entry: Entry; onOpen: () => void }) {
  const update = useUpdate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const { title, meta } = describeEntry(section.type, entry)
  const draft = isDraftEntry(section.type, entry)

  const editEntry = (mutate: (list: Entry[], index: number) => void) =>
    update((d) => {
      const list = getEntries(d, section)
      const index = list.findIndex((e) => e.id === entry.id)
      if (index >= 0) mutate(list, index)
    })
  const toggleHidden = () => editEntry((list, i) => void (list[i]!.hidden = !entry.hidden))
  const menu = (e: MouseEvent) =>
    openMenu(e, [
      { label: entry.hidden ? 'Show on the page' : 'Hide from the page', icon: entry.hidden ? Eye : EyeOff, onSelect: toggleHidden },
      { label: 'Duplicate', icon: Copy, onSelect: () => editEntry((list, i) => list.splice(i + 1, 0, { ...structuredClone(entry), id: generateId() })) },
      'separator',
      { label: 'Delete', icon: Trash2, danger: true, onSelect: () => editEntry((list, i) => list.splice(i, 1)) },
    ])

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onContextMenu={menu}
      className={`group flex items-center gap-1.5 rounded-xl border border-line bg-white/[0.03] py-1.5 pr-1.5 pl-1 transition hover:border-line-strong ${isDragging ? 'z-10 shadow-lg shadow-black/40' : ''} ${entry.hidden ? 'opacity-50' : ''}`}
    >
      <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${title || 'entry'}`} className="cursor-grab text-ink-3 hover:text-ink-2 active:cursor-grabbing">
        <GripVertical size={14} />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm">{title || <span className="text-ink-3 italic">Untitled</span>}</span>
        {meta && <span className="block truncate text-[11px] text-ink-3">{meta}</span>}
      </button>
      {draft && <Chip tone="warn" title="Fill in the first field to print this entry">Draft</Chip>}
      <button
        type="button"
        onClick={toggleHidden}
        aria-label={entry.hidden ? 'Show on the page' : 'Hide from the page'}
        className="grid h-6 w-6 place-items-center rounded-md text-ink-3 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-ink focus:opacity-100"
      >
        {entry.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </li>
  )
}
