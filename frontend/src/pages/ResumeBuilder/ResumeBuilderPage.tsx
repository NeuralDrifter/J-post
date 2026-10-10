// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Star } from 'lucide-react'
import { syncResumeDates } from '@reactive-resume/schema/resume/dates'
import { api, apiOk } from '../../lib/api'
import { GetDocument, GetSettings, SaveDocument, type app } from '../../lib/backend'
import { exportDocument, setDefaultResume, type ExportFormat } from '../../lib/resumes/actions'
import { resumeExportable } from '../../lib/resumes/stored'
import { parseStoredResume, resumePlainText, serializeResume, type ResumeData } from '../../lib/resumes/document'
import { useLoad } from '../../lib/useLoad'
import { BuilderTopBar, useEditorControls } from './BuilderTopBar'
import { ContentPanel } from './content/ContentPanel'
import { DesignContext, type DesignEditor } from './design/designContext'
import { ResumeDesignPanel } from './design/DesignPanel'
import { EditorContext, useEditor, useEditorStore } from './editorContext'
import { createEditorStore } from './editorStore'
import { EditorShell } from './EditorShell'
import { exportMenuItems } from './exportMenu'
import { PreviewCanvas } from './PreviewCanvas'
import { RepairView } from './RepairView'
import { useBuilderHotkeys } from './useBuilderHotkeys'
import { useSaveOnClose } from './useSaveOnClose'
import { zoomIn, zoomOut, type Zoom } from './zoom'

const BACK = { to: '/resumes', label: 'Resumes' }

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
  if (!content.ok) return <RepairView doc={doc} error={content.error} back={BACK} />
  return <Workspace doc={doc} initial={content.data} isDefault={isDefault} />
}

function Workspace({ doc, initial, isDefault }: { doc: app.Document; initial: ResumeData; isDefault: boolean }) {
  const [store] = useState(() =>
    createEditorStore(
      initial,
      (data) => apiOk(SaveDocument(doc.id, serializeResume(data), resumePlainText(data))),
      // The printed date text ("Mar 2022 – Present") follows the structured dates, as upstream keeps it.
      (draft) => syncResumeDates(draft as ResumeData),
    ),
  )
  useSaveOnClose(store)
  return (
    <EditorContext value={store}>
      <ResumeEditor doc={doc} isDefault={isDefault} />
    </EditorContext>
  )
}

function ResumeEditor({ doc, isDefault }: { doc: app.Document; isDefault: boolean }) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const data = useEditor((s) => s.data)
  const update = useEditor((s) => s.update)
  const controls = useEditorControls(useEditorStore())
  const design = useMemo<DesignEditor>(() => ({ metadata: data.metadata, updateMetadata: (recipe) => update((d) => recipe(d.metadata)) }), [data.metadata, update])
  const exportAs = (format: ExportFormat) => exportDocument(resumeExportable(doc.name, data), format)
  useBuilderHotkeys({ undo: controls.undo, redo: controls.redo, exportPdf: () => void exportAs('pdf'), zoomIn: () => setZoom(zoomIn), zoomOut: () => setZoom(zoomOut) })

  return (
    <DesignContext value={design}>
      <EditorShell
        renderTopBar={(togglePanel) => (
          <BuilderTopBar
            docId={doc.id}
            name={doc.name}
            back={BACK}
            controls={controls}
            exportItems={exportMenuItems(exportAs, 'Ctrl+S')}
            actions={<DefaultResumeButton docId={doc.id} isDefault={isDefault} />}
            zoom={zoom}
            onZoom={setZoom}
            onTogglePanel={togglePanel}
          />
        )}
        left={{ title: 'Content', content: <ContentPanel /> }}
        right={{ title: 'Design', content: <ResumeDesignPanel /> }}
      >
        <PreviewCanvas zoom={zoom} data={data} />
      </EditorShell>
    </DesignContext>
  )
}

function DefaultResumeButton({ docId, isDefault }: { docId: string; isDefault: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn-ghost py-1 text-xs ${isDefault ? 'text-indigo-200' : ''}`}
      onClick={() => setDefaultResume(isDefault ? '' : docId)}
      title={isDefault ? 'Match scores and mock interviews read this resume' : 'Use this resume for match scores and mock interviews'}
    >
      <Star size={13} className={isDefault ? 'fill-current' : ''} /> {isDefault ? 'Default' : 'Set as default'}
    </button>
  )
}
