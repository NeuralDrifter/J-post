// @vitest-environment happy-dom
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { richTextExtensions } from '@reactive-resume/web/components/input/rich-text-extensions'

let editor: Editor | undefined
afterEach(() => editor?.destroy())

/** What the rich text field saves after opening `html` and changing nothing. */
function roundTrip(html: string): string {
  editor = new Editor({ extensions: richTextExtensions, content: html })
  return editor.getHTML()
}

describe('rich text field', () => {
  it('keeps imported alignment, highlights and colours', () => {
    const html = roundTrip('<p style="text-align: center">Led <mark data-color="#fde68a" style="background-color: #fde68a">the</mark> <span style="color: #2563eb">team</span></p>')
    expect(html).toContain('text-align: center')
    expect(html).toContain('<mark')
    expect(html).toContain('color: #2563eb')
  })

  it('turns Markdown typed at the start of a line into formatting', () => {
    editor = new Editor({ extensions: richTextExtensions, content: '<p></p>' })
    type(editor, '- ')
    expect(editor.isActive('bulletList')).toBe(true)
  })
})

/** Types text as a keyboard would: each character goes through the editor's text input handlers (its Markdown rules). */
function type(target: Editor, text: string) {
  for (const char of text) {
    const { view } = target
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (handle) => handle(view, from, to, char, () => view.state.tr.insertText(char, from, to)))
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to))
  }
}
