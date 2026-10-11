// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { Copy, Crosshair, Maximize2, Wand2 } from 'lucide-react'
import type { SemanticCssColorToken } from '@reactive-resume/web/features/resume/stylesheet/color-tokens'
import { revealStyleRule } from '@reactive-resume/web/features/resume/stylesheet/editor-extensions'
import { formatEditorDocument } from '@reactive-resume/web/features/resume/stylesheet/formatter'
import { matchedNodeKeys } from '@reactive-resume/web/features/resume/stylesheet/highlight'
import { styleTargetFor } from '@reactive-resume/web/features/resume/stylesheet/targets'
import { Modal } from '../../../components/Modal'
import { BrowserOpenURL } from '../../../lib/backend'
import { toast } from '../../../lib/toast'
import { useStylePick } from '../stylePick'
import { useBuilderView } from '../viewStore'
import { CssCodeEditor } from './CssCodeEditor'
import { useDesign } from './designContext'
import { compileForEditor, editorMetadata, replaceColor, STYLESHEET_LANGUAGE_VERSION } from './stylesheetModel'

const DOCS_URL = 'https://docs.rxresu.me/applying-custom-styles'

/** Reactive Resume's PDF-safe CSS, for styling beyond the design controls. */
export function CustomCssSection() {
  const { metadata, updateMetadata, page } = useDesign()
  const text = metadata.stylesheet?.source.text ?? ''
  const { errors, colorTokens } = useMemo(() => compileForEditor(text), [text])
  const editorMeta = useMemo(() => editorMetadata(page.data), [page.data])
  const view = useRef<EditorView | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [colorEdit, setColorEdit] = useState<{ token: SemanticCssColorToken; rect: DOMRect } | null>(null)
  const picking = useStylePick((s) => s.onPick !== null)

  const setText = (next: string) => updateMetadata((m) => void (m.stylesheet = { mode: 'semantic', source: { languageVersion: STYLESHEET_LANGUAGE_VERSION, text: next } }))
  // The rule under the cursor outlines the blocks it styles on the page; nothing once the editor closes.
  const highlightAt = (offset: number | null) => useBuilderView.getState().setStyleHighlight(offset === null ? [] : matchedNodeKeys(text, offset, editorMeta.semanticTree))
  useEffect(
    () => () => {
      useBuilderView.getState().setStyleHighlight([])
      useStylePick.getState().setOnPick(null)
    },
    [],
  )

  const startPick = () =>
    useStylePick.getState().setOnPick((target) => {
      if (view.current) revealStyleRule(view.current, styleTargetFor(page.data, target))
    })
  const copy = () => navigator.clipboard.writeText(text).then(() => toast.success('Stylesheet copied'), () => toast.error("The stylesheet couldn't be copied."))
  const format = () => {
    if (view.current) formatEditorDocument(view.current).catch(() => toast.error("The stylesheet couldn't be formatted; check it for errors."))
  }

  const editor = (
    <CssCodeEditor
      value={text}
      onChange={setText}
      metadata={editorMeta}
      colorTokens={colorTokens}
      onColorSelect={(token, rect) => setColorEdit({ token, rect })}
      onCursor={highlightAt}
      viewRef={view}
    />
  )
  const toolbar = (
    <div role="toolbar" aria-label="Stylesheet editor" className="flex flex-wrap gap-1">
      <ToolButton label="Copy stylesheet" onClick={() => void copy()} icon={<Copy size={13} />} />
      <ToolButton label="Format stylesheet" onClick={format} icon={<Wand2 size={13} />} />
      <ToolButton label={picking ? 'Click a block on the page…' : 'Pick a block on the page'} onClick={startPick} icon={<Crosshair size={13} />} active={picking} />
      <ToolButton label="Focus mode" onClick={() => setFocusMode(true)} icon={<Maximize2 size={13} />} />
    </div>
  )

  return (
    <div className="space-y-2">
      {toolbar}
      {focusMode ? <p className="text-xs text-ink-3">Editing in focus mode.</p> : <div className="h-56">{editor}</div>}
      {focusMode && (
        <Modal title="Custom CSS" onClose={() => setFocusMode(false)} width="max-w-4xl">
          <div className="space-y-2">
            {toolbar}
            <div className="h-[60vh]">{editor}</div>
          </div>
        </Modal>
      )}
      {colorEdit && <ColorEdit edit={colorEdit} onPick={(color) => setText(replaceColor(text, colorEdit.token, color))} onClose={() => setColorEdit(null)} />}
      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-rose-200">
          <p className="mb-1 font-semibold">These styles aren't applied until the errors are fixed:</p>
          <ul className="list-inside list-disc">
            {errors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-ink-3">
        PDFs support a subset of CSS.{' '}
        <button type="button" className="text-indigo-300 underline underline-offset-2" onClick={() => BrowserOpenURL(DOCS_URL)}>
          What you can write
        </button>
      </p>
    </div>
  )
}

function ToolButton({ label, onClick, icon, active = false }: { label: string; onClick: () => void; icon: ReactNode; active?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick} className={`btn btn-ghost py-1 text-xs ${active ? 'border-accent text-indigo-100' : ''}`}>
      {icon}
    </button>
  )
}

/** A swatch was clicked: the system colour picker, beside it, replaces that colour in the stylesheet. */
function ColorEdit({ edit, onPick, onClose }: { edit: { token: SemanticCssColorToken; rect: DOMRect }; onPick: (color: string) => void; onClose: () => void }) {
  const hex = /^#[\da-f]{6}$/i.test(edit.token.value) ? edit.token.value : '#000000'
  return (
    <div className="glass fixed z-[70] flex items-center gap-2 rounded-xl bg-raised/95 p-2 text-xs shadow-2xl" style={{ left: edit.rect.left, top: edit.rect.bottom + 4 }}>
      <input type="color" aria-label={`Edit color ${edit.token.value}`} defaultValue={hex} onChange={(e) => onPick(e.target.value)} className="h-7 w-10 cursor-pointer bg-transparent" />
      <button type="button" className="btn btn-ghost py-0.5 text-xs" onClick={onClose}>
        Done
      </button>
    </div>
  )
}
