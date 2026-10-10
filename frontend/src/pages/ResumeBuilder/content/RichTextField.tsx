// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, Link2, List, ListOrdered, Underline, type LucideIcon } from 'lucide-react'
import { promptDialog } from '../../../components/ConfirmDialog'

type Mark = { label: string; icon: LucideIcon; isActive: (e: Editor) => boolean; run: (e: Editor) => void }

const MARKS: Mark[] = [
  { label: 'Bold', icon: Bold, isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'Italic', icon: Italic, isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'Underline', icon: Underline, isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
  { label: 'Bulleted list', icon: List, isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: ListOrdered, isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Link', icon: Link2, isActive: (e) => e.isActive('link'), run: (e) => void editLink(e) },
]

async function editLink(editor: Editor) {
  const current = editor.getAttributes('link').href ?? ''
  const href = await promptDialog({ title: 'Link', label: 'URL (leave empty to remove the link)', initial: current, confirmLabel: 'Apply' })
  if (href === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href) chain.setLink({ href }).run()
  else chain.unsetLink().run()
}

/** Rich text (Reactive Resume stores it as HTML): bold, italic, underline, lists and links. */
export function RichTextField({ label, html, onChange, minHeight = 'min-h-28' }: { label: string; html: string; onChange: (html: string) => void; minHeight?: string }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false, link: { openOnClick: false } })],
    content: html,
    editorProps: { attributes: { class: `markdown field ${minHeight} max-h-80 overflow-y-auto text-sm`, 'aria-label': label } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  })

  // Undo/redo replaces the document from outside: show it unless it is what we just typed.
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getHTML() !== html) editor.commands.setContent(html, { emitUpdate: false })
  }, [editor, html])

  return (
    <div className="space-y-1.5">
      <span className="label-mono">{label}</span>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({ editor, selector: ({ editor: e }) => MARKS.map((mark) => mark.isActive(e)) })
  return (
    <div className="flex gap-0.5" role="toolbar" aria-label="Formatting">
      {MARKS.map((mark, i) => (
        <button
          key={mark.label}
          type="button"
          title={mark.label}
          aria-label={mark.label}
          aria-pressed={active[i]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => mark.run(editor)}
          className={`grid h-7 w-7 place-items-center rounded-md transition ${active[i] ? 'bg-accent/25 text-ink' : 'text-ink-2 hover:bg-white/10 hover:text-ink'}`}
        >
          <mark.icon size={14} />
        </button>
      ))}
    </div>
  )
}
