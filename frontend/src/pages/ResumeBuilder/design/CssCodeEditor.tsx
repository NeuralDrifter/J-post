// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, type RefObject } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { SemanticCssColorToken } from '@reactive-resume/web/features/resume/stylesheet/color-tokens'
import { createSemanticCssEditorExtensions, type SemanticCssColorSelection } from '@reactive-resume/web/features/resume/stylesheet/editor-extensions'
import type { SemanticCssEditorMetadata } from '@reactive-resume/web/features/resume/stylesheet/protocol'

// The editor in J-POST's colours (index.css @theme tokens).
const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'rgb(0 0 0 / 0.3)', color: 'var(--color-ink)', borderRadius: '0.5rem', border: '1px solid var(--color-line)', fontSize: '12px', height: '100%' },
    '&.cm-focused': { outline: 'none', borderColor: 'var(--color-accent)', boxShadow: '0 0 0 3px rgb(99 102 241 / 0.2)' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--color-ink)', minHeight: '10rem' },
    '.cm-gutters': { display: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgb(255 255 255 / 0.03)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(99 102 241 / 0.3) !important' },
    '.cm-placeholder': { color: 'var(--color-ink-3)' },
    '.cm-tooltip': { backgroundColor: 'var(--color-raised)', border: '1px solid var(--color-line-strong)', borderRadius: '0.5rem', color: 'var(--color-ink)' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgb(99 102 241 / 0.3)', color: 'var(--color-ink)' },
    '.cm-panels': { backgroundColor: 'var(--color-raised)', color: 'var(--color-ink)' },
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

type Props = {
  value: string
  onChange: (text: string) => void
  /** The document's blocks, for autocomplete and hover help. */
  metadata: SemanticCssEditorMetadata
  colorTokens: readonly SemanticCssColorToken[]
  onColorSelect: SemanticCssColorSelection
  /** Where the cursor is while the editor has focus; null once it hasn't. */
  onCursor: (offset: number | null) => void
  /** Lets the owner act on the editor: format it, aim it at a block picked on the page. */
  viewRef: RefObject<EditorView | null>
}

/** A CodeMirror CSS editor with Reactive Resume's extensions; outside changes (undo) replace its text unless it already shows them. */
export function CssCodeEditor({ value, onChange, metadata, colorTokens, onColorSelect, onCursor, viewRef }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const assist = useRef(new Compartment())
  const callbacks = useRef({ onChange, onCursor, onColorSelect })
  callbacks.current = { onChange, onCursor, onColorSelect }

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          css(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          placeholder('section { letter-spacing: 0.08em; }'),
          assist.current.of([]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString())
            if (u.selectionSet || u.docChanged || u.focusChanged) callbacks.current.onCursor(u.view.hasFocus ? u.state.selection.main.head : null)
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Created once; later values arrive through the effects below.
  }, [])

  // Autocomplete, hover help and swatches follow the document and the stylesheet's colours.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: assist.current.reconfigure(createSemanticCssEditorExtensions({ metadata, colorTokens, onColorSelect: (token, rect) => callbacks.current.onColorSelect(token, rect) })),
    })
  }, [metadata, colorTokens, viewRef])

  useEffect(() => {
    const editor = viewRef.current
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value, viewRef])

  return <div ref={host} className="h-full" />
}
