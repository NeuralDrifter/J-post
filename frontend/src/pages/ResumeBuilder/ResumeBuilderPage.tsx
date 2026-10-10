// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { AlertTriangle, ArrowLeft, X } from 'lucide-react'
import { api, apiOk } from '../../lib/api'
import { GetDocument, GetSettings, SaveDocument, type app } from '../../lib/backend'
import { exportRawDocument, exportResumePdf } from '../../lib/resumes/actions'
import { parseStoredResume, resumePlainText, serializeResume, type ResumeData } from '../../lib/resumes/document'
import { useLoad } from '../../lib/useLoad'
import { BuilderTopBar } from './BuilderTopBar'
import { ContentPanel } from './content/ContentPanel'
import { DesignPanel } from './design/DesignPanel'
import { EditorContext, useEditor } from './editorContext'
import { createEditorStore } from './editorStore'
import { PreviewCanvas } from './PreviewCanvas'
import { useBuilderHotkeys } from './useBuilderHotkeys'
import { zoomIn, zoomOut, type Zoom } from './zoom'

/** /resumes/:id — remounted per resume so no editing state leaks between them. */
export default function ResumeBuilderPage() {
  const { id = '' } = useParams()
  return <ResumeBuilder key={id} id={id} />
}

function ResumeBuilder({ id }: { id: string }) {
  const { data: doc } = useLoad(() => api(GetDocument(id)), [id])
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  if (!doc) return null
  return <LoadedResume doc={doc} isDefault={settings?.defaultResumeId === doc.id} />
}

/** Reads the stored resume once: from then on the editor owns its content (later reloads only refresh the name). */
function LoadedResume({ doc, isDefault }: { doc: app.Document; isDefault: boolean }) {
  const [content] = useState(() => parseStoredResume(doc.data))
  if (!content.ok) return <RepairView doc={doc} error={content.error} />
  return <Workspace doc={doc} initial={content.data} isDefault={isDefault} />
}

function Workspace({ doc, initial, isDefault }: { doc: app.Document; initial: ResumeData; isDefault: boolean }) {
  const [store] = useState(() => createEditorStore(initial, (data) => apiOk(SaveDocument(doc.id, serializeResume(data), resumePlainText(data)))))
  // Anything still unsaved is saved when the builder closes.
  useEffect(() => () => {
    store.getState().dispose()
    void store.getState().saveNow()
  }, [store])

  return (
    <EditorContext value={store}>
      <Shell doc={doc} isDefault={isDefault} />
    </EditorContext>
  )
}

type Drawer = 'content' | 'design' | null

function Shell({ doc, isDefault }: { doc: app.Document; isDefault: boolean }) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [drawer, setDrawer] = useState<Drawer>(null)
  const data = useEditor((s) => s.data)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  useBuilderHotkeys({ undo, redo, exportPdf: () => void exportResumePdf(doc.name, data), zoomIn: () => setZoom(zoomIn), zoomOut: () => setZoom(zoomOut) })

  return (
    <div className="flex h-full flex-col">
      <BuilderTopBar docId={doc.id} name={doc.name} isDefault={isDefault} zoom={zoom} onZoom={setZoom} onTogglePanel={(p) => setDrawer((open) => (open === p ? null : p))} />
      <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] min-[1100px]:grid-cols-[minmax(320px,400px)_1fr_minmax(290px,340px)]">
        <SidePanel side="left" title="Content" open={drawer === 'content'} onClose={() => setDrawer(null)}>
          <ContentPanel />
        </SidePanel>
        <PreviewCanvas zoom={zoom} />
        <SidePanel side="right" title="Design" open={drawer === 'design'} onClose={() => setDrawer(null)}>
          <DesignPanel />
        </SidePanel>
      </div>
    </div>
  )
}

/** A column beside the page on wide windows; a drawer over it on narrow ones. */
function SidePanel({ side, title, open, onClose, children }: { side: 'left' | 'right'; title: string; open: boolean; onClose: () => void; children: ReactNode }) {
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

/** A saved resume that no longer reads as a resume: shown, never overwritten, and exportable as-is. */
function RepairView({ doc, error }: { doc: app.Document; error: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <Link to="/resumes" className="flex w-fit items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={13} /> Resumes
      </Link>
      <div className="glass space-y-3 rounded-2xl p-5">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle size={18} className="text-warn" /> “{doc.name}” can't be opened
        </h1>
        <p className="text-sm text-ink-2">{error}</p>
        <p className="text-sm text-ink-2">Nothing was changed. Save a copy of its data to keep it, or move it to Trash.</p>
        <button type="button" className="btn btn-ghost" onClick={() => void exportRawDocument(doc)}>
          Save its data as JSON
        </button>
      </div>
    </div>
  )
}
