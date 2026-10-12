// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import type { Editor } from '@tiptap/react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import type { ProposalTarget } from '@reactive-resume/resume/proposals'
import { editMenu } from '../../../components/ContextMenu'
import { promptDialog } from '../../../components/ConfirmDialog'
import type { app } from '../../../lib/backend'
import { openMenu, type MenuItem } from '../../../lib/menu'
import { fieldKeyOf, IMPROVE_ACTIONS, improveInput, linePassage, type ImproveAction, type ImproveContext } from '../../../lib/resumes/ai/improve'
import { SETTINGS_TASK } from '../../../lib/resumes/ai/tasks'
import { toast } from '../../../lib/toast'
import { acceptChanges, rejectChanges, reopenChanges, type AIDocument } from './aiDocument'
import { ChangeRow } from './ChangeRow'
import { useReview } from './ReviewContext'
import { useAIReview } from './reviewStore'
import { useTaskProvider } from './taskProvider'

const runKey = (target: ProposalTarget) => `improve:${fieldKeyOf(target)}`

/** Asks for one line to be improved; the suggestion comes back as a change under the field. */
function improveLine<T>(doc: AIDocument<T>, target: ProposalTarget, line: string, action: ImproveAction, request = '') {
  const data = doc.editor.getState().data
  const passages = doc.passages(data)
  const passage = linePassage(passages, target, line)
  if (!passage) return void toast.info('Put the cursor on a line with text to improve it.')
  const context: ImproveContext = { passages: [passage], action, request }
  void useAIReview.getState().run(runKey(target), {
    task: SETTINGS_TASK.improve,
    documentId: doc.docId,
    sectionKey: passage.target.sectionId,
    input: improveInput(passage, passages, action, request),
    context: JSON.stringify(context),
  } as app.ResumeAIRequest)
}

/** Improve ▸ Stronger verb, Add a result, Make it shorter, Something else… for the line given by `line()`. */
function improveMenu(run: (action: ImproveAction, request?: string) => void): MenuItem {
  const custom = async () => {
    const request = (await promptDialog({ title: 'Improve this line', label: 'What should change?', initial: '', confirmLabel: 'Improve' }))?.trim()
    if (request) run('custom', request)
  }
  return {
    label: 'Improve',
    icon: Sparkles,
    submenu: [...IMPROVE_ACTIONS.map((a) => ({ label: a.label, onSelect: () => run(a.id) })), 'separator', { label: 'Something else…', onSelect: () => void custom() }],
  }
}

/** The text of the paragraph or bullet under a point on the page, or at the caret. */
function lineAt(editor: Editor, point?: { x: number; y: number }): string {
  const pos = point ? editor.view.posAtCoords({ left: point.x, top: point.y })?.pos : editor.state.selection.from
  if (pos === undefined) return ''
  return editor.state.doc.resolve(pos).parent.textContent
}

type Props = { editor: Editor; target: ProposalTarget }

/** Right-click a line for Improve ▸; adds the edit menu after it, replacing the app's plain one. */
export function useImproveMenu({ editor, target }: Props) {
  const { doc } = useReview()
  useEffect(() => {
    const dom = editor.view.dom
    const onContext = (e: MouseEvent) => {
      const line = lineAt(editor, { x: e.clientX, y: e.clientY })
      openMenu(e, [improveMenu((action, request) => improveLine(doc, target, line, action, request)), 'separator', ...editMenu(dom)])
    }
    dom.addEventListener('contextmenu', onContext)
    return () => dom.removeEventListener('contextmenu', onContext)
  }, [editor, target, doc])
}

/** The ✨ button in the field's toolbar: Improve ▸ for the line with the caret. */
export function ImproveButton({ editor, target }: Props) {
  const { doc } = useReview()
  useImproveMenu({ editor, target })
  const show = (e: ReactMouseEvent) => {
    const line = lineAt(editor)
    openMenu(e, [improveMenu((action, request) => improveLine(doc, target, line, action, request))])
  }
  return (
    <button
      type="button"
      title="Improve the line with the cursor"
      aria-label="Improve the line with the cursor"
      onMouseDown={(e) => e.preventDefault()}
      onClick={show}
      className="ml-1.5 grid h-7 w-7 place-items-center rounded-md text-indigo-300 transition hover:bg-white/10"
    >
      <Sparkles size={14} />
    </button>
  )
}

/** Under the field: the improve in progress (and what it sends), its error, and its suggestions to accept or reject. */
export function FieldChanges({ target }: { target: ProposalTarget }) {
  const { doc, reviews } = useReview()
  const key = runKey(target)
  const running = useAIReview((s) => s.running[key])
  const error = useAIReview((s) => s.errors[key])
  const generations = useAIReview((s) => s.generations)
  const provider = useTaskProvider(SETTINGS_TASK.improve)
  const field = fieldKeyOf(target)
  const changes = reviews.flatMap((r) => r.changes).filter((c) => c.fieldKey === field && c.status === 'pending' && c.generationId)
  const genOf = (id: string) => generations.find((g) => g.id === id)
  if (!running && !error && changes.length === 0) return null
  return (
    <div className="space-y-1.5">
      {running && (
        <p className="flex items-center gap-2 text-[11px] text-ink-2">
          <LoaderCircle size={12} className="animate-spin" /> Sending this line and the rest of the field to {provider.label}…
        </p>
      )}
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      {changes.length > 0 && (
        <ul className="space-y-1.5">
          {changes.map((change) => {
            const gen = genOf(change.generationId)
            if (!gen) return null
            return (
              <ChangeRow
                key={change.key}
                change={change}
                onAccept={() => void acceptChanges(doc, gen, [change])}
                onReject={() => void rejectChanges(gen, [change])}
                onReopen={() => void reopenChanges(gen, [change])}
                sectionMenu={[]}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
