// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Side = 'left' | 'right'

type Props = {
  /** The top bar, given the function that shows or hides a side panel on narrow windows. */
  renderTopBar: (togglePanel: (side: Side) => void) => ReactNode
  left: { title: string; content: ReactNode }
  right: { title: string; content: ReactNode }
  children: ReactNode
}

/**
 * A document editor's frame: a top bar, then the page between two panels. On narrow
 * windows the panels become drawers over the page.
 */
export function EditorShell({ renderTopBar, left, right, children }: Props) {
  const [drawer, setDrawer] = useState<Side | null>(null)
  const toggle = (side: Side) => setDrawer((open) => (open === side ? null : side))
  return (
    <div className="flex h-full flex-col">
      {renderTopBar(toggle)}
      <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] min-[1100px]:grid-cols-[minmax(320px,400px)_1fr_minmax(290px,340px)]">
        <SidePanel side="left" title={left.title} open={drawer === 'left'} onClose={() => setDrawer(null)}>
          {left.content}
        </SidePanel>
        {children}
        <SidePanel side="right" title={right.title} open={drawer === 'right'} onClose={() => setDrawer(null)}>
          {right.content}
        </SidePanel>
      </div>
    </div>
  )
}

function SidePanel({ side, title, open, onClose, children }: { side: Side; title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const edge = side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
  return (
    <aside
      aria-label={title}
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 z-20 w-[min(400px,90vw)] flex-col border-line bg-base/95 backdrop-blur-xl min-[1100px]:static min-[1100px]:flex min-[1100px]:w-auto min-[1100px]:bg-base/40 min-[1100px]:backdrop-blur-none ${edge}`}
    >
      <div className="flex items-center justify-between px-3 pt-3 min-[1100px]:hidden">
        <span className="label-mono">{title}</span>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="text-ink-2 hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}
