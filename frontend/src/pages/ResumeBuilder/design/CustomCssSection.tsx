// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { compileStylesheet, isFatalStylesheetDiagnostic } from '@reactive-resume/resume/stylesheet'
import { BrowserOpenURL } from '../../../lib/backend'
import { useResume, useUpdate } from '../editorContext'

const STYLESHEET_LANGUAGE_VERSION = 1
const DOCS_URL = 'https://docs.rxresu.me/applying-custom-styles'

// The editor in Job Track's colours (index.css @theme tokens).
const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'rgb(0 0 0 / 0.3)', color: 'var(--color-ink)', borderRadius: '0.5rem', border: '1px solid var(--color-line)', fontSize: '12px' },
    '&.cm-focused': { outline: 'none', borderColor: 'var(--color-accent)', boxShadow: '0 0 0 3px rgb(99 102 241 / 0.2)' },
    '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--color-ink)', minHeight: '10rem' },
    '.cm-gutters': { display: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgb(255 255 255 / 0.03)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(99 102 241 / 0.3) !important' },
    '.cm-placeholder': { color: 'var(--color-ink-3)' },
  },
  { dark: true },
)
const highlight = HighlightStyle.define([
  { tag: [tags.className, tags.tagName], color: '#a5b4fc' },
  { tag: tags.propertyName, color: '#67e8f9' },
  { tag: [tags.number, tags.unit, tags.color], color: '#fbbf24' },
  { tag: [tags.string, tags.keyword], color: '#6ee7b7' },
  { tag: tags.comment, color: 'var(--color-ink-3)', fontStyle: 'italic' },
])

/** Reactive Resume's PDF-safe CSS, for styling beyond the design controls. */
export function CustomCssSection() {
  const stylesheet = useResume().metadata.stylesheet
  const update = useUpdate()
  const text = stylesheet?.source.text ?? ''
  const errors = useMemo(() => fatalErrors(text), [text])

  const setText = (next: string) =>
    update((d) => void (d.metadata.stylesheet = { mode: 'semantic', source: { languageVersion: STYLESHEET_LANGUAGE_VERSION, text: next } }))

  return (
    <div className="space-y-2">
      <CodeEditor value={text} onChange={setText} />
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

function fatalErrors(text: string): string[] {
  if (!text.trim()) return []
  return compileStylesheet({ languageVersion: STYLESHEET_LANGUAGE_VERSION, text }).diagnostics.filter(isFatalStylesheetDiagnostic).map((d) => d.message)
}

/** A CodeMirror CSS editor; outside changes (undo) replace its text unless it already shows them. */
function CodeEditor({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          css(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          placeholder('.section-title { letter-spacing: 0.08em; }'),
          EditorView.updateListener.of((u) => u.docChanged && onChangeRef.current(u.state.doc.toString())),
        ],
      }),
    })
    return () => view.current?.destroy()
    // Created once; later values arrive through the effect below.
  }, [])

  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  return <div ref={host} />
}
