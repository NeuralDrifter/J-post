// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Download, FileDown, FileJson, Minus, PanelLeft, PanelRight, Plus, Redo2, Star, Undo2 } from 'lucide-react'
import { IconButton } from '../../components/IconButton'
import { apiOk } from '../../lib/api'
import { RenameDocument } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { openMenu } from '../../lib/menu'
import { exportResumeJson, exportResumePdf, setDefaultResume } from '../../lib/resumes/actions'
import { useEditor } from './editorContext'
import type { SaveState } from './editorStore'
import { zoomIn, zoomLabel, zoomOut, type Zoom } from './zoom'

const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Not saved' }
const SAVE_TONE: Record<SaveState, string> = { saved: 'text-success', unsaved: 'text-ink-3', saving: 'text-ink-3', error: 'text-danger' }

type Props = {
  docId: string
  name: string
  isDefault: boolean
  zoom: Zoom
  onZoom: (zoom: Zoom) => void
  onTogglePanel: (panel: 'content' | 'design') => void
}

/** Back, name, save state, undo/redo, zoom, default and export. */
export function BuilderTopBar({ docId, name, isDefault, zoom, onZoom, onTogglePanel }: Props) {
  const data = useEditor((s) => s.data)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.canUndo())
  const canRedo = useEditor((s) => s.canRedo())

  const exportMenu = (e: MouseEvent) =>
    openMenu(e, [
      { label: 'PDF', icon: FileDown, shortcut: 'Ctrl+S', onSelect: () => exportResumePdf(name, data) },
      { label: 'JSON (Reactive Resume)', icon: FileJson, onSelect: () => exportResumeJson(name, data) },
    ])

  return (
    <div className="flex items-center gap-2 border-b border-line bg-base/60 px-3 py-2">
      <Link to="/resumes" className="flex shrink-0 items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={13} /> Resumes
      </Link>
      <span className="text-line-strong">/</span>
      <NameInput docId={docId} name={name} />
      <SaveIndicator />
      <div className="ml-auto flex items-center gap-1">
        <span className="min-[1100px]:hidden">
          <IconButton label="Content" onClick={() => onTogglePanel('content')}>
            <PanelLeft size={15} />
          </IconButton>
        </span>
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={15} />
        </IconButton>
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
        <button
          type="button"
          className={`btn py-1 text-xs ${isDefault ? 'btn-ghost text-indigo-200' : 'btn-ghost'}`}
          onClick={() => setDefaultResume(isDefault ? '' : docId)}
          title={isDefault ? 'Match scores and mock interviews read this resume' : 'Use this resume for match scores and mock interviews'}
        >
          <Star size={13} className={isDefault ? 'fill-current' : ''} /> {isDefault ? 'Default' : 'Set as default'}
        </button>
        <button type="button" className="btn btn-primary py-1 text-xs" onClick={exportMenu}>
          <Download size={13} /> Export
        </button>
        <span className="min-[1100px]:hidden">
          <IconButton label="Design" onClick={() => onTogglePanel('design')}>
            <PanelRight size={15} />
          </IconButton>
        </span>
      </div>
    </div>
  )
}

/** The document's name, edited in place; saved when focus leaves it. */
function NameInput({ docId, name }: { docId: string; name: string }) {
  const [typed, setTyped] = useState<string | null>(null)
  const commit = async () => {
    const next = typed?.trim()
    setTyped(null)
    if (next && next !== name && (await apiOk(RenameDocument(docId, next)))) notifyDataChanged()
  }
  return (
    <input
      className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold outline-none hover:border-line focus:border-accent"
      value={typed ?? name}
      onChange={(e) => setTyped(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      aria-label="Resume name"
    />
  )
}

function SaveIndicator() {
  const saveState = useEditor((s) => s.saveState)
  const saveNow = useEditor((s) => s.saveNow)
  return (
    <span className={`flex shrink-0 items-center gap-1.5 font-mono text-[11px] ${SAVE_TONE[saveState]}`} role="status">
      {SAVE_LABEL[saveState]}
      {saveState === 'error' && (
        <button type="button" className="text-indigo-300 underline underline-offset-2" onClick={() => void saveNow()}>
          Retry
        </button>
      )}
    </span>
  )
}
