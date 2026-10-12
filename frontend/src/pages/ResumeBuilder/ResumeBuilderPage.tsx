// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'
import { Star } from 'lucide-react'
import { syncResumeDates } from '@reactive-resume/schema/resume/dates'
import { api, apiOk } from '../../lib/api'
import { returnTarget } from '../../lib/needsResume'
import { GetDocument, GetSettings, SaveDocument, type app } from '../../lib/backend'
import { exportDocument, setDefaultResume, setDocumentLocked, type ExportFormat } from '../../lib/resumes/actions'
import { resumeExportable } from '../../lib/resumes/stored'
import { newEditingSession } from '../../lib/resumes/versions'
import { parseStoredResume, resumePlainText, serializeResume, type ResumeData } from '../../lib/resumes/document'
import { useLoad } from '../../lib/useLoad'
import { compileResumeGeneration, resumePassages, sectionTitle } from '../../lib/resumes/ai/resumeChanges'
import type { AIDocument } from './ai/aiDocument'
import { ImportTidyBanner } from './ai/ImportTidyBanner'
import { ReviewBar } from './ai/ReviewBar'
import { TailorPanel } from './ai/TailorPanel'
import { AIReviewProvider } from './ai/ReviewContext'
import { BuilderTopBar, useEditorControls } from './BuilderTopBar'
import { CheckPanel } from './check/CheckPanel'
import { useDocumentMenu } from './DocumentMenu'
import { ContentPanel } from './content/ContentPanel'
import { DesignContext, type DesignEditor } from './design/designContext'
import { ResumeDesignPanel } from './design/DesignPanel'
import { EditorContext, useEditor, useEditorStore } from './editorContext'
import { createEditorStore } from './editorStore'
import { EditorShell } from './EditorShell'
import { exportMenuItems } from './exportMenu'
import { HistoryPanel, type PreviewedVersion } from './history/HistoryPanel'
import { useVersionHistory } from './history/useVersionHistory'
import { RepairView } from './RepairView'
import { ResumeCanvas, type ResumeVersion } from './ResumeCanvas'
import { Segmented } from './ui/controls'
import { ReadOnly } from './ui/ReadOnly'
import { useBuilderHotkeys } from './useBuilderHotkeys'
import { useSaveOnClose } from './useSaveOnClose'
import { useBuilderView } from './viewStore'
import { zoomIn, zoomOut, type Zoom } from './zoom'

const BACK = { to: '/resumes', label: 'Resumes' }

type RightPanel = 'design' | 'tailor' | 'check' | 'history'

const RIGHT_PANELS: { value: RightPanel; label: string }[] = [
  { value: 'design', label: 'Design' },
  { value: 'tailor', label: 'Tailor' },
  { value: 'check', label: 'Check' },
  { value: 'history', label: 'History' },
]

const isRightPanel = (value: string | null): value is RightPanel => RIGHT_PANELS.some((p) => p.value === value)

/** /resumes/:id — remounted per resume so no editing state leaks between them. */
export default function ResumeBuilderPage() {
  const { id = '' } = useParams()
  return <ResumeBuilder key={id} id={id} />
}

function ResumeBuilder({ id }: { id: string }) {
  const { data: doc } = useLoad(() => api(GetDocument(id)), [id])
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  // Restoring a version reopens the editor on the restored content.
  const [restored, setRestored] = useState<app.Document | null>(null)
  if (!doc) return null
  return (
    <LoadedResume
      key={restored?.updatedAt ?? 'loaded'}
      doc={doc}
      data={restored?.data ?? doc.data}
      isDefault={settings?.defaultResumeId === doc.id}
      reopened={restored !== null}
      onRestored={setRestored}
    />
  )
}

/** `reopened`: the editor reopened after a restore, so it opens on History again. */
type EditorProps = { doc: app.Document; isDefault: boolean; reopened: boolean; onRestored: (doc: app.Document) => void }

/** Reads the stored resume once: from then on the editor owns its content (later reloads only refresh the name). */
function LoadedResume({ data, ...props }: EditorProps & { data: string }) {
  const [content] = useState(() => parseStoredResume(data))
  if (!content.ok) return <RepairView doc={props.doc} error={content.error} back={BACK} />
  return <Workspace {...props} initial={content.data} />
}

function Workspace({ initial, ...props }: EditorProps & { initial: ResumeData }) {
  const { doc } = props
  const [session] = useState(newEditingSession)
  const [store] = useState(() =>
    createEditorStore(
      initial,
      (data) => apiOk(SaveDocument(doc.id, serializeResume(data), resumePlainText(data), session)),
      // The printed date text ("Mar 2022 – Present") follows the structured dates, as upstream keeps it.
      (draft) => syncResumeDates(draft as ResumeData),
    ),
  )
  useSaveOnClose(store)
  useEffect(() => {
    store.getState().setLocked(doc.locked)
  }, [store, doc.locked])
  // What the builder shows (selection, Check's state) belongs to this visit only.
  useEffect(() => () => useBuilderView.getState().reset(), [])
  const aiDoc = useMemo<AIDocument<ResumeData>>(
    () => ({ docId: doc.id, editor: store, compile: compileResumeGeneration, serialize: serializeResume, plainText: resumePlainText, sectionTitle, passages: resumePassages }),
    [doc.id, store],
  )
  return (
    <EditorContext value={store}>
      <AIReviewProvider doc={aiDoc}>
        <ResumeEditor {...props} />
      </AIReviewProvider>
    </EditorContext>
  )
}

function ResumeEditor({ doc, isDefault, reopened, onRestored }: EditorProps) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const search = useLocation().search
  const [rightPanel, setRightPanel] = useState<RightPanel>(reopened ? 'history' : 'design')
  // ?panel=tailor (from a job page or a section's menu) opens that panel.
  const askedPanel = new URLSearchParams(search).get('panel')
  useEffect(() => {
    if (isRightPanel(askedPanel)) setRightPanel(askedPanel)
  }, [askedPanel])
  const data = useEditor((s) => s.data)
  const update = useEditor((s) => s.update)
  const store = useEditorStore()
  const controls = useEditorControls(store)
  const history = useVersionHistory(doc.id, store, resumePlainText, onRestored)
  const previewed = usePreviewedResume(rightPanel === 'history' ? history.previewed : null)
  const locked = doc.locked
  const panels: Record<RightPanel, ReactNode> = {
    design: <ReadOnly when={locked}><ResumeDesignPanel /></ReadOnly>,
    tailor: <TailorPanel doc={doc} />,
    check: <ReadOnly when={locked}><CheckPanel doc={doc} /></ReadOnly>,
    history: <HistoryPanel {...history} />,
  }
  const design = useMemo<DesignEditor>(
    () => ({
      metadata: data.metadata,
      updateMetadata: (recipe) => update((d) => recipe(d.metadata)),
      undo: () => store.getState().undo(),
      page: { data },
      previewTemplate: useBuilderView.getState().setPreviewTemplate,
    }),
    [data, update, store],
  )
  const exportable = resumeExportable(doc.name, data)
  const exportAs = (format: ExportFormat) => exportDocument(exportable, format)
  const pageCount = useBuilderView((s) => s.rendered.pageCount)
  const back = returnTarget(search, BACK)
  const menu = useDocumentMenu({ doc, exportable, back: BACK.to, details: { template: data.metadata.template, pageCount, plainText: resumePlainText(data) } })
  useBuilderHotkeys({ undo: controls.undo, redo: controls.redo, exportPdf: () => void exportAs('pdf'), print: () => void menu.print(), zoomIn: () => setZoom(zoomIn), zoomOut: () => setZoom(zoomOut) })

  return (
    <DesignContext value={design}>
      <EditorShell
        renderTopBar={(togglePanel) => (
          <BuilderTopBar
            docId={doc.id}
            name={doc.name}
            back={back}
            controls={controls}
            exportItems={exportMenuItems(exportAs, 'Ctrl+S')}
            documentItems={menu.items}
            locked={locked}
            onUnlock={() => void setDocumentLocked(doc, false)}
            actions={
              <>
                <ReviewBar />
                <DefaultResumeButton docId={doc.id} isDefault={isDefault} />
              </>
            }
            zoom={zoom}
            onZoom={setZoom}
            onTogglePanel={togglePanel}
          />
        )}
        left={{
          title: 'Content',
          content: (
            <ReadOnly when={locked}>
              <ImportTidyBanner doc={doc} />
              <ContentPanel />
            </ReadOnly>
          ),
        }}
        right={{
          title: RIGHT_PANELS.find((p) => p.value === rightPanel)?.label ?? 'Design',
          content: (
            <div className="space-y-3">
              <Segmented label="Panel" options={RIGHT_PANELS} value={rightPanel} onChange={setRightPanel} />
              {panels[rightPanel]}
            </div>
          ),
        }}
      >
        <ResumeCanvas zoom={zoom} checking={rightPanel === 'check'} version={previewed} />
      </EditorShell>
      {menu.dialog}
    </DesignContext>
  )
}

/** The version previewed in History, read as a resume; undefined when none is shown or it can't be read. */
function usePreviewedResume(version: PreviewedVersion | null): ResumeVersion | undefined {
  return useMemo(() => {
    if (!version) return undefined
    const parsed = parseStoredResume(version.data)
    return parsed.ok ? { title: version.title, data: parsed.data } : undefined
  }, [version])
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
