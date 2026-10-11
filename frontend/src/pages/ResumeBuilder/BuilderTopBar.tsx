// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useStore, type StoreApi } from 'zustand'
import { ArrowLeft, ChevronDown, Download, Lock, Minus, PanelLeft, PanelRight, Plus, Redo2, Undo2 } from 'lucide-react'
import { IconButton } from '../../components/IconButton'
import { apiOk } from '../../lib/api'
import { RenameDocument } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { openMenu, type MenuEntry } from '../../lib/menu'
import type { EditorState, SaveState } from './editorStore'
import { zoomIn, zoomLabel, zoomOut, type Zoom } from './zoom'

const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Not saved' }
const SAVE_TONE: Record<SaveState, string> = { saved: 'text-success', unsaved: 'text-ink-3', saving: 'text-ink-3', error: 'text-danger' }

/** What the top bar needs from an open document's editor, whatever the document is. */
export type EditorControls = Pick<EditorState<unknown>, 'saveState' | 'saveNow' | 'undo' | 'redo'> & { canUndo: boolean; canRedo: boolean }

export function useEditorControls<T>(store: StoreApi<EditorState<T>>): EditorControls {
  return {
    saveState: useStore(store, (s) => s.saveState),
    saveNow: useStore(store, (s) => s.saveNow),
    undo: useStore(store, (s) => s.undo),
    redo: useStore(store, (s) => s.redo),
    canUndo: useStore(store, (s) => s.canUndo()),
    canRedo: useStore(store, (s) => s.canRedo()),
  }
}

type Props = {
  docId: string
  name: string
  back: { to: string; label: string }
  controls: EditorControls
  exportItems: MenuEntry[]
  /** The document menu, opened from beside the name. */
  documentItems: MenuEntry[]
  /** A locked document shows it, and its name can't be edited. */
  locked: boolean
  onUnlock: () => void
  /** Extra buttons before Export, e.g. the resume's Set as default. */
  actions?: ReactNode
  zoom: Zoom
  onZoom: (zoom: Zoom) => void
  onTogglePanel: (panel: 'left' | 'right') => void
}

/** Back, name, save state, undo/redo, zoom, extra actions and export. */
export function BuilderTopBar({ docId, name, back, controls, exportItems, documentItems, locked, onUnlock, actions, zoom, onZoom, onTogglePanel }: Props) {
  const exportMenu = (e: MouseEvent) => openMenu(e, exportItems)
  return (
    <div className="flex items-center gap-2 border-b border-line bg-base/60 px-3 py-2">
      <Link to={back.to} className="flex shrink-0 items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={13} /> {back.label}
      </Link>
      <span className="text-line-strong">/</span>
      <NameInput docId={docId} name={name} locked={locked} />
      <IconButton label="Document menu" onClick={(e) => openMenu(e, documentItems)}>
        <ChevronDown size={14} />
      </IconButton>
      {locked ? <LockedChip onUnlock={onUnlock} /> : <SaveIndicator state={controls.saveState} onRetry={() => void controls.saveNow()} />}
      <div className="ml-auto flex items-center gap-1">
        <span className="min-[1100px]:hidden">
          <IconButton label="Show the left panel" onClick={() => onTogglePanel('left')}>
            <PanelLeft size={15} />
          </IconButton>
        </span>
        <IconButton label="Undo (Ctrl+Z)" onClick={controls.undo} disabled={!controls.canUndo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={controls.redo} disabled={!controls.canRedo}>
          <Redo2 size={15} />
        </IconButton>
        <ZoomControl zoom={zoom} onZoom={onZoom} />
        {actions}
        <button type="button" className="btn btn-primary py-1 text-xs" onClick={exportMenu}>
          <Download size={13} /> Export
        </button>
        <span className="min-[1100px]:hidden">
          <IconButton label="Show the right panel" onClick={() => onTogglePanel('right')}>
            <PanelRight size={15} />
          </IconButton>
        </span>
      </div>
    </div>
  )
}

function ZoomControl({ zoom, onZoom }: { zoom: Zoom; onZoom: (zoom: Zoom) => void }) {
  return (
    <div className="mx-1 flex items-center rounded-lg border border-line bg-black/20">
      <IconButton label="Zoom out" onClick={() => onZoom(zoomOut(zoom))}>
        <Minus size={13} />
      </IconButton>
      <button type="button" className="w-12 font-mono text-[11px] text-ink-2 hover:text-ink" onClick={() => onZoom('fit')} title="Fit to width">
        {zoomLabel(zoom)}
      </button>
      <IconButton label="Zoom in" onClick={() => onZoom(zoomIn(zoom))}>
        <Plus size={13} />
      </IconButton>
    </div>
  )
}

/** The document's name, edited in place; saved when focus leaves it. */
function NameInput({ docId, name, locked }: { docId: string; name: string; locked: boolean }) {
  const [typed, setTyped] = useState<string | null>(null)
  const commit = async () => {
    const next = typed?.trim()
    setTyped(null)
    if (next && next !== name && (await apiOk(RenameDocument(docId, next)))) notifyDataChanged()
  }
  return (
    <input
      className="max-w-[40ch] min-w-[6ch] truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold [field-sizing:content] outline-none hover:border-line focus:border-accent"
      value={typed ?? name}
      readOnly={locked}
      onChange={(e) => setTyped(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      aria-label="Name"
    />
  )
}

function LockedChip({ onUnlock }: { onUnlock: () => void }) {
  return (
    <button type="button" onClick={onUnlock} title="Unlock editing" className="flex shrink-0 items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-200 hover:bg-warn/20">
      <Lock size={11} /> Locked
    </button>
  )
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <span className={`flex shrink-0 items-center gap-1.5 font-mono text-[11px] ${SAVE_TONE[state]}`} role="status">
      {SAVE_LABEL[state]}
      {state === 'error' && (
        <button type="button" className="text-indigo-300 underline underline-offset-2" onClick={onRetry}>
          Retry
        </button>
      )}
    </span>
  )
}
