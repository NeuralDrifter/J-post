// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useStore, type StoreApi } from 'zustand'
import { api, apiOk } from '../../lib/api'
import { GetDocument, SaveDocument, type app } from '../../lib/backend'
import { exportDocument, type ExportFormat } from '../../lib/resumes/actions'
import { LETTER_RENDER_OPTIONS, letterPageData, letterPlainText, parseStoredLetter, serializeLetter, type LetterData } from '../../lib/resumes/letter'
import { letterExportable } from '../../lib/resumes/stored'
import { useLoad } from '../../lib/useLoad'
import { BuilderTopBar, useEditorControls } from '../ResumeBuilder/BuilderTopBar'
import { DesignContext, type DesignEditor } from '../ResumeBuilder/design/designContext'
import { LetterDesignPanel } from '../ResumeBuilder/design/DesignPanel'
import { createEditorStore, type EditorState } from '../ResumeBuilder/editorStore'
import { EditorShell } from '../ResumeBuilder/EditorShell'
import { exportMenuItems } from '../ResumeBuilder/exportMenu'
import { PreviewCanvas } from '../ResumeBuilder/PreviewCanvas'
import { RepairView } from '../ResumeBuilder/RepairView'
import { useBuilderHotkeys } from '../ResumeBuilder/useBuilderHotkeys'
import { useSaveOnClose } from '../ResumeBuilder/useSaveOnClose'
import { zoomIn, zoomOut, type Zoom } from '../ResumeBuilder/zoom'
import { WritePanel } from './WritePanel'

const BACK = { to: '/resumes?tab=letters', label: 'Cover letters' }

/** /letters/:id — remounted per letter so no editing state leaks between them. */
export default function LetterWriterPage() {
  const { id = '' } = useParams()
  return <LetterWriter key={id} id={id} />
}

function LetterWriter({ id }: { id: string }) {
  const { data: doc } = useLoad(() => api(GetDocument(id)), [id])
  return doc ? <LoadedLetter doc={doc} /> : null
}

/** Reads the stored letter once: from then on the editor owns its content. */
function LoadedLetter({ doc }: { doc: app.Document }) {
  const [content] = useState(() => parseStoredLetter(doc.data))
  if (!content.ok) return <RepairView doc={doc} error={content.error} back={BACK} />
  return <Workspace doc={doc} initial={content.data} />
}

function Workspace({ doc, initial }: { doc: app.Document; initial: LetterData }) {
  const [store] = useState(() => createEditorStore(initial, (letter) => apiOk(SaveDocument(doc.id, serializeLetter(letter), letterPlainText(letter)))))
  useSaveOnClose(store)
  return <LetterEditor doc={doc} store={store} />
}

function LetterEditor({ doc, store }: { doc: app.Document; store: StoreApi<EditorState<LetterData>> }) {
  const [zoom, setZoom] = useState<Zoom>('fit')
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
        right={{ title: 'Design', content: <LetterDesignPanel /> }}
      >
        <PreviewCanvas zoom={zoom} data={page} renderOptions={LETTER_RENDER_OPTIONS} />
      </EditorShell>
    </DesignContext>
  )
}
