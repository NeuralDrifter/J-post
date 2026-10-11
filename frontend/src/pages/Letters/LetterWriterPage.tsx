// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useStore, type StoreApi } from 'zustand'
import { api, apiOk } from '../../lib/api'
import { GetDocument, SaveDocument, type app } from '../../lib/backend'
import { exportDocument, type ExportFormat } from '../../lib/resumes/actions'
import { LETTER_RENDER_OPTIONS, letterPageData, letterPlainText, parseStoredLetter, serializeLetter, type LetterData } from '../../lib/resumes/letter'
import { letterExportable } from '../../lib/resumes/stored'
import { newEditingSession } from '../../lib/resumes/versions'
import { useLoad } from '../../lib/useLoad'
import { BuilderTopBar, useEditorControls } from '../ResumeBuilder/BuilderTopBar'
import { DesignContext, type DesignEditor } from '../ResumeBuilder/design/designContext'
import { LetterDesignPanel } from '../ResumeBuilder/design/DesignPanel'
import { createEditorStore, type EditorState } from '../ResumeBuilder/editorStore'
import { EditorShell } from '../ResumeBuilder/EditorShell'
import { exportMenuItems } from '../ResumeBuilder/exportMenu'
import { HistoryPanel, type PreviewedVersion } from '../ResumeBuilder/history/HistoryPanel'
import { useVersionHistory } from '../ResumeBuilder/history/useVersionHistory'
import { PreviewCanvas } from '../ResumeBuilder/PreviewCanvas'
import { VersionBanner } from '../ResumeBuilder/history/VersionBanner'
import { RepairView } from '../ResumeBuilder/RepairView'
import { Segmented } from '../ResumeBuilder/ui/controls'
import { useBuilderHotkeys } from '../ResumeBuilder/useBuilderHotkeys'
import { useSaveOnClose } from '../ResumeBuilder/useSaveOnClose'
import { zoomIn, zoomOut, type Zoom } from '../ResumeBuilder/zoom'
import { WritePanel } from './WritePanel'

const BACK = { to: '/resumes?tab=letters', label: 'Cover letters' }

type RightPanel = 'design' | 'history'

const RIGHT_PANELS: { value: RightPanel; label: string }[] = [
  { value: 'design', label: 'Design' },
  { value: 'history', label: 'History' },
]

/** `reopened`: the editor reopened after a restore, so it opens on History again. */
type EditorProps = { doc: app.Document; reopened: boolean; onRestored: (doc: app.Document) => void }

/** /letters/:id — remounted per letter so no editing state leaks between them. */
export default function LetterWriterPage() {
  const { id = '' } = useParams()
  return <LetterWriter key={id} id={id} />
}

function LetterWriter({ id }: { id: string }) {
  const { data: doc } = useLoad(() => api(GetDocument(id)), [id])
  // Restoring a version reopens the editor on the restored content.
  const [restored, setRestored] = useState<app.Document | null>(null)
  if (!doc) return null
  return <LoadedLetter key={restored?.updatedAt ?? 'loaded'} doc={doc} data={restored?.data ?? doc.data} reopened={restored !== null} onRestored={setRestored} />
}

/** Reads the stored letter once: from then on the editor owns its content. */
function LoadedLetter({ data, ...props }: EditorProps & { data: string }) {
  const [content] = useState(() => parseStoredLetter(data))
  if (!content.ok) return <RepairView doc={props.doc} error={content.error} back={BACK} />
  return <Workspace {...props} initial={content.data} />
}

function Workspace({ initial, ...props }: EditorProps & { initial: LetterData }) {
  const { doc } = props
  const [session] = useState(newEditingSession)
  const [store] = useState(() => createEditorStore(initial, (letter) => apiOk(SaveDocument(doc.id, serializeLetter(letter), letterPlainText(letter), session))))
  useSaveOnClose(store)
  return <LetterEditor {...props} store={store} />
}

function LetterEditor({ doc, store, reopened, onRestored }: EditorProps & { store: StoreApi<EditorState<LetterData>> }) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [rightPanel, setRightPanel] = useState<RightPanel>(reopened ? 'history' : 'design')
  const history = useVersionHistory(doc.id, store, onRestored)
  const previewed = usePreviewedLetter(rightPanel === 'history' ? history.previewed : null)
  const panels: Record<RightPanel, ReactNode> = { design: <LetterDesignPanel />, history: <HistoryPanel {...history} /> }
  const letter = useStore(store, (s) => s.data)
  const update = useStore(store, (s) => s.update)
  const controls = useEditorControls(store)
  const page = useMemo(() => letterPageData(letter), [letter])
  const design = useMemo<DesignEditor>(
    () => ({ metadata: letter.style.metadata, updateMetadata: (recipe) => update((d) => recipe(d.style.metadata)) }),
    [letter.style.metadata, update],
  )
  const exportAs = (format: ExportFormat) => exportDocument(letterExportable(doc.name, letter), format)
  useBuilderHotkeys({ undo: controls.undo, redo: controls.redo, exportPdf: () => void exportAs('pdf'), zoomIn: () => setZoom(zoomIn), zoomOut: () => setZoom(zoomOut) })

  return (
    <DesignContext value={design}>
      <EditorShell
        renderTopBar={(togglePanel) => (
          <BuilderTopBar docId={doc.id} name={doc.name} back={BACK} controls={controls} exportItems={exportMenuItems(exportAs, 'Ctrl+S')} zoom={zoom} onZoom={setZoom} onTogglePanel={togglePanel} />
        )}
        left={{ title: 'Write', content: <WritePanel letter={letter} update={update} /> }}
        right={{
          title: rightPanel === 'history' ? 'History' : 'Design',
          content: (
            <div className="space-y-3">
              <Segmented label="Panel" options={RIGHT_PANELS} value={rightPanel} onChange={setRightPanel} />
              {panels[rightPanel]}
            </div>
          ),
        }}
      >
        <PreviewCanvas
          zoom={zoom}
          data={previewed?.page ?? page}
          renderOptions={LETTER_RENDER_OPTIONS}
          toolbar={previewed && <VersionBanner title={previewed.title} />}
        />
      </EditorShell>
    </DesignContext>
  )
}

/** The version previewed in History, as a page; undefined when none is shown or it can't be read. */
function usePreviewedLetter(version: PreviewedVersion | null) {
  return useMemo(() => {
    if (!version) return undefined
    const parsed = parseStoredLetter(version.data)
    return parsed.ok ? { title: version.title, page: letterPageData(parsed.data) } : undefined
  }, [version])
}
