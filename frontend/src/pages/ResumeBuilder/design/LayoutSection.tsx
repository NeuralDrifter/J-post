// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { ArrowDown, ArrowLeftRight, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { getResumeSectionTitle } from '@reactive-resume/pdf/section-title'
import { templateLayouts } from '@reactive-resume/schema/templates'
import { IconButton } from '../../../components/IconButton'
import { useResume, useUpdate } from '../editorContext'
import { Segmented, Slider, Toggle } from '../ui/controls'
import { addPage, moveInColumn, moveToColumn, removePage, type Column } from './layout'

type Side = 'template' | 'left' | 'right'

const SIDES: { value: Side; label: string }[] = [
  { value: 'template', label: "Template's" },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]
const COLUMN_LABEL: Record<Column, string> = { main: 'Main column', sidebar: 'Sidebar' }

/** Which page and column each section prints in, the sidebar's width and side, and the pages themselves. */
export function LayoutSection() {
  const data = useResume()
  const update = useUpdate()
  const { layout, template } = data.metadata
  const twoColumns = templateLayouts[template].columns === 2

  return (
    <div className="space-y-4">
      {twoColumns ? (
        <>
          <Slider label="Sidebar width" value={layout.sidebarWidth} min={10} max={50} unit="%" onChange={(v) => update((d) => void (d.metadata.layout.sidebarWidth = v))} />
          <div className="space-y-1.5">
            <span className="label-mono">Sidebar side</span>
            <Segmented<Side> label="Sidebar side" options={SIDES} value={layout.sidebarSide ?? 'template'} onChange={(side) => update((d) => void (d.metadata.layout.sidebarSide = side === 'template' ? undefined : side))} />
          </div>
        </>
      ) : (
        <p className="text-xs text-ink-3">This template prints one column: sidebar sections print after the main ones.</p>
      )}
      {layout.pages.map((page, pageIndex) => (
        <div key={pageIndex} className="space-y-2 rounded-xl border border-line bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Page {pageIndex + 1}</span>
            {layout.pages.length > 1 && (
              <IconButton label={`Remove page ${pageIndex + 1}`} onClick={() => update((d) => removePage(d, pageIndex))}>
                <Trash2 size={13} />
              </IconButton>
            )}
          </div>
          {twoColumns && <Toggle label="Full width" hint="No sidebar on this page." checked={page.fullWidth} onChange={(v) => update((d) => void (d.metadata.layout.pages[pageIndex]!.fullWidth = v))} />}
          {(['main', 'sidebar'] as const).map((column) => (
            <ColumnList key={column} pageIndex={pageIndex} column={column} ids={page[column]} pageCount={layout.pages.length} title={(id) => getResumeSectionTitle(data, id)} />
          ))}
        </div>
      ))}
      <button type="button" className="btn btn-ghost w-full py-1.5 text-xs" onClick={() => update(addPage)}>
        <Plus size={13} /> Add page
      </button>
    </div>
  )
}

function ColumnList({ pageIndex, column, ids, pageCount, title }: { pageIndex: number; column: Column; ids: string[]; pageCount: number; title: (id: string) => string }) {
  const update = useUpdate()
  const other: Column = column === 'main' ? 'sidebar' : 'main'
  return (
    <div className="space-y-1">
      <span className="label-mono">{COLUMN_LABEL[column]}</span>
      {ids.length === 0 && <p className="text-[11px] text-ink-3">Empty</p>}
      {ids.map((id, index) => (
        <div key={id} className="flex items-center gap-1 rounded-lg border border-line bg-black/20 py-0.5 pr-0.5 pl-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{title(id)}</span>
          {pageCount > 1 && (
            <select
              className="rounded-md border border-line bg-transparent px-1 py-0.5 text-[11px] text-ink-2"
              value={pageIndex}
              aria-label={`Page for ${title(id)}`}
              onChange={(e) => update((d) => moveToColumn(d, id, Number(e.target.value), column))}
            >
              {Array.from({ length: pageCount }, (_, i) => (
                <option key={i} value={i}>
                  p{i + 1}
                </option>
              ))}
            </select>
          )}
          <IconButton label={`Move ${title(id)} to the ${COLUMN_LABEL[other].toLowerCase()}`} onClick={() => update((d) => moveToColumn(d, id, pageIndex, other))}>
            <ArrowLeftRight size={12} />
          </IconButton>
          {index > 0 && (
            <IconButton label={`Move ${title(id)} up`} onClick={() => update((d) => moveInColumn(d, pageIndex, column, id, -1))}>
              <ArrowUp size={12} />
            </IconButton>
          )}
          {index < ids.length - 1 && (
            <IconButton label={`Move ${title(id)} down`} onClick={() => update((d) => moveInColumn(d, pageIndex, column, id, 1))}>
              <ArrowDown size={12} />
            </IconButton>
          )}
        </div>
      ))}
    </div>
  )
}
