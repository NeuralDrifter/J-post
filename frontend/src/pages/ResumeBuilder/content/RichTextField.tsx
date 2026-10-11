// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { Bold, Italic, Link2, List, ListOrdered, RemoveFormatting, Underline, type LucideIcon } from 'lucide-react'
import { hasUnsupportedTableMarkup, richTextExtensions } from '@reactive-resume/web/components/input/rich-text-extensions'
import { promptDialog } from '../../../components/ConfirmDialog'

type Mark = { label: string; icon: LucideIcon; isActive?: (e: Editor) => boolean; run: (e: Editor) => void }

const MARKS: Mark[] = [
  { label: 'Bold', icon: Bold, isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'Italic', icon: Italic, isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'Underline', icon: Underline, isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
  { label: 'Bulleted list', icon: List, isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: ListOrdered, isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Link', icon: Link2, isActive: (e) => e.isActive('link'), run: (e) => void editLink(e) },
  { label: 'Clear formatting', icon: RemoveFormatting, run: (e) => e.chain().focus().clearNodes().unsetAllMarks().unsetTextAlign().run() },
]

async function editLink(editor: Editor) {
  const current = editor.getAttributes('link').href ?? ''
  const href = await promptDialog({ title: 'Link', label: 'URL (leave empty to remove the link)', initial: current, confirmLabel: 'Apply' })
  if (href === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href.trim() && href.trim() !== 'https://') chain.setLink({ href }).run()
  else chain.unsetLink().run()
}

/**
 * Rich text, stored as HTML as Reactive Resume stores it. It uses Reactive Resume's own extensions, so
 * imported formatting (alignment, colour, highlights, indents) survives editing, and Markdown shortcuts
 * work as you type ("- " starts a list, "**bold**").
 */
export function RichTextField({ label, html, onChange, minHeight = 'min-h-28' }: { label: string; html: string; onChange: (html: string) => void; minHeight?: string }) {
  // Tables the editor can't change safely are kept exactly as they are, read-only.
  const readOnlyTable = useMemo(() => hasUnsupportedTableMarkup(html), [html])
  const [focused, setFocused] = useState(false)
  const editor = useEditor({
    extensions: richTextExtensions,
    content: html,
    editable: !readOnlyTable,
    editorProps: { attributes: { class: `markdown field ${minHeight} max-h-80 overflow-y-auto text-sm`, 'aria-label': label } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  })

  // Undo/redo replaces the document from outside: show it unless it is what we just typed.
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getHTML() !== html) editor.commands.setContent(html, { emitUpdate: false })
  }, [editor, html])
  useEffect(() => {
    editor?.setEditable(!readOnlyTable, false)
  }, [editor, readOnlyTable])

  return (
    <div className="space-y-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="label-mono">{label}</span>
        {focused && <span className="text-[10px] text-ink-3">Markdown shortcuts on</span>}
      </span>
      {readOnlyTable ? (
        <p role="status" className="text-xs text-ink-3">
          The original table formatting is kept. This text is read-only because it can't be edited safely.
        </p>
      ) : (
        editor && <Toolbar editor={editor} />
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({ editor, selector: ({ editor: e }) => MARKS.map((mark) => mark.isActive?.(e) ?? false) })
  return (
    <div className="flex gap-0.5" role="toolbar" aria-label="Formatting">
      {MARKS.map((mark, i) => (
        <button
          key={mark.label}
          type="button"
          title={mark.label}
          aria-label={mark.label}
          aria-pressed={mark.isActive ? active[i] : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => mark.run(editor)}
          // Clear formatting (the one action with no on/off state) sits a little apart.
          className={`grid h-7 w-7 place-items-center rounded-md transition ${active[i] ? 'bg-accent/25 text-ink' : 'text-ink-2 hover:bg-white/10 hover:text-ink'} ${mark.isActive ? '' : 'ml-1.5'}`}
        >
          <mark.icon size={14} />
        </button>
      ))}
    </div>
  )
}
