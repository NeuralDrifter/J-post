// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useStore, type StoreApi } from 'zustand'
import { api, apiOk } from '../../lib/api'
import { GetDocument, SaveDocument, type app } from '../../lib/backend'
import { exportDocument, setDocumentLocked, type ExportFormat } from '../../lib/resumes/actions'
import type { Template } from '../../lib/resumes/document'
import type { ResumeData } from '../../lib/resumes/document'
import { LETTER_RENDER_OPTIONS, letterPageData, letterPlainText, parseStoredLetter, serializeLetter, withLinkedStyle, type LetterData } from '../../lib/resumes/letter'
import { letterExportable } from '../../lib/resumes/stored'
import { newEditingSession } from '../../lib/resumes/versions'
import { compileLetterGeneration, letterPassages, letterSectionTitle } from '../../lib/resumes/ai/letterChanges'
import { useLoad } from '../../lib/useLoad'
import type { AIDocument } from '../ResumeBuilder/ai/aiDocument'
import { ReviewBar } from '../ResumeBuilder/ai/ReviewBar'
import { AIReviewProvider } from '../ResumeBuilder/ai/ReviewContext'
import { BuilderTopBar, useEditorControls } from '../ResumeBuilder/BuilderTopBar'
import { DesignContext, type DesignEditor } from '../ResumeBuilder/design/designContext'
import { useDocumentMenu } from '../ResumeBuilder/DocumentMenu'
import { LetterDesignPanel } from '../ResumeBuilder/design/DesignPanel'
import { createEditorStore, type EditorState } from '../ResumeBuilder/editorStore'
import { EditorShell } from '../ResumeBuilder/EditorShell'
import { exportMenuItems } from '../ResumeBuilder/exportMenu'
import { HistoryPanel, type PreviewedVersion } from '../ResumeBuilder/history/HistoryPanel'
import { useVersionHistory } from '../ResumeBuilder/history/useVersionHistory'
import { PreviewCanvas, type RenderedPreview } from '../ResumeBuilder/PreviewCanvas'
import { VersionBanner } from '../ResumeBuilder/history/VersionBanner'
import { RepairView } from '../ResumeBuilder/RepairView'
import { Segmented } from '../ResumeBuilder/ui/controls'
import { ReadOnly } from '../ResumeBuilder/ui/ReadOnly'
import { useBuilderHotkeys } from '../ResumeBuilder/useBuilderHotkeys'
import { useSaveOnClose } from '../ResumeBuilder/useSaveOnClose'
import { zoomIn, zoomOut, type Zoom } from '../ResumeBuilder/zoom'
import { linksOf, loadSourceResume } from './LetterLinks'
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

/** Waits for the resume the letter follows, if any, so the letter opens with its current sender and design. */
function LoadedLetter(props: EditorProps & { data: string }) {
  const { data: source, loading } = useLoad(() => loadSourceResume(props.doc), [props.doc.sourceId])
  if (source === undefined && loading) return null
  return <ParsedLetter {...props} source={source ?? null} />
}

/** Reads the stored letter once: from then on the editor owns its content. */
function ParsedLetter({ data, source, ...props }: EditorProps & { data: string; source: ResumeData | null }) {
  const [content] = useState(() => parseStoredLetter(data))
  if (!content.ok) return <RepairView doc={props.doc} error={content.error} back={BACK} />
  const initial = source ? withLinkedStyle(content.data, source, linksOf(props.doc)) : content.data
  return <Workspace {...props} initial={initial} />
}

function Workspace({ initial, ...props }: EditorProps & { initial: LetterData }) {
  const { doc } = props
  const [session] = useState(newEditingSession)
  const [store] = useState(() => createEditorStore(initial, (letter) => apiOk(SaveDocument(doc.id, serializeLetter(letter), letterPlainText(letter), session))))
  useSaveOnClose(store)
  useEffect(() => {
    store.getState().setLocked(doc.locked)
  }, [store, doc.locked])
  const aiDoc = useMemo<AIDocument<LetterData>>(
    () => ({ docId: doc.id, editor: store, compile: compileLetterGeneration, serialize: serializeLetter, plainText: letterPlainText, sectionTitle: letterSectionTitle, passages: letterPassages }),
    [doc.id, store],
  )
  return (
    <AIReviewProvider doc={aiDoc}>
      <LetterEditor {...props} store={store} />
    </AIReviewProvider>
  )
}

function LetterEditor({ doc, store, reopened, onRestored }: EditorProps & { store: StoreApi<EditorState<LetterData>> }) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [rightPanel, setRightPanel] = useState<RightPanel>(reopened ? 'history' : 'design')
  const history = useVersionHistory(doc.id, store, letterPlainText, onRestored)
  const previewed = usePreviewedLetter(rightPanel === 'history' ? history.previewed : null)
  const locked = doc.locked
  const panels: Record<RightPanel, ReactNode> = {
    design: (
      <div className="space-y-2">
        {doc.designLinked && <p className="text-xs text-ink-3">The design comes from the resume this letter follows; change it there.</p>}
        <ReadOnly when={locked || doc.designLinked}>
          <LetterDesignPanel />
        </ReadOnly>
      </div>
    ),
    history: <HistoryPanel {...history} />,
  }
  const [pageCount, setPageCount] = useState(0)
  const onRendered = useCallback((preview: RenderedPreview) => setPageCount(preview.pageCount), [])
  const letter = useStore(store, (s) => s.data)
  const update = useStore(store, (s) => s.update)
  const controls = useEditorControls(store)
  const page = useMemo(() => letterPageData(letter), [letter])
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const shownPage = useMemo(() => (previewTemplate ? { ...page, metadata: { ...page.metadata, template: previewTemplate } } : page), [page, previewTemplate])
  const design = useMemo<DesignEditor>(
    () => ({
      metadata: letter.style.metadata,
      updateMetadata: (recipe) => update((d) => recipe(d.style.metadata)),
      undo: () => store.getState().undo(),
      page: { data: page, renderOptions: LETTER_RENDER_OPTIONS },
      previewTemplate: setPreviewTemplate,
    }),
    [letter.style.metadata, update, store, page],
  )
  const exportable = letterExportable(doc.name, letter)
  const exportAs = (format: ExportFormat) => exportDocument(exportable, format)
  const menu = useDocumentMenu({ doc, exportable, back: BACK.to, details: { template: letter.style.metadata.template, pageCount, plainText: letterPlainText(letter) } })
  useBuilderHotkeys({ undo: controls.undo, redo: controls.redo, exportPdf: () => void exportAs('pdf'), print: () => void menu.print(), zoomIn: () => setZoom(zoomIn), zoomOut: () => setZoom(zoomOut) })

  return (
    <DesignContext value={design}>
      <EditorShell
        renderTopBar={(togglePanel) => (
          <BuilderTopBar docId={doc.id} name={doc.name} back={BACK} controls={controls} exportItems={exportMenuItems(exportAs, 'Ctrl+S')} documentItems={menu.items} actions={<ReviewBar />} locked={locked} onUnlock={() => void setDocumentLocked(doc, false)} zoom={zoom} onZoom={setZoom} onTogglePanel={togglePanel} />
        )}
        left={{
          title: 'Write',
          content: (
            <ReadOnly when={locked}>
              <WritePanel doc={doc} letter={letter} update={update} />
            </ReadOnly>
          ),
        }}
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
          data={previewed?.page ?? shownPage}
          renderOptions={LETTER_RENDER_OPTIONS}
          toolbar={previewed && <VersionBanner title={previewed.title} />}
          onRendered={onRendered}
        />
      </EditorShell>
      {menu.dialog}
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
