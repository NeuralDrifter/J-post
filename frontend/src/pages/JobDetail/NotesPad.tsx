import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { Panel } from '../../components/Panel'
import { apiOk } from '../../lib/api'
import { UpdateJobNotes } from '../../lib/backend'

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

const STATE_LABEL: Record<SaveState, string> = { saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Save failed' }

/** Markdown notes that autosave 800ms after typing stops, and on leaving the page. */
export function NotesPad({ jobId, initial }: { jobId: string; initial: string }) {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<SaveState>('saved')
  const [preview, setPreview] = useState(false)
  const saved = useRef(initial)
  const latest = useRef(initial)
  latest.current = text

  useEffect(() => {
    if (text === saved.current) return
    setState('unsaved')
    const timer = setTimeout(async () => {
      setState('saving')
      const ok = await apiOk(UpdateJobNotes(jobId, text))
      if (ok) saved.current = text
      // If more was typed during the save, that change has its own timer pending.
      setState(!ok ? 'error' : latest.current === text ? 'saved' : 'unsaved')
    }, 800)
    return () => clearTimeout(timer)
  }, [text, jobId])

  // Flush anything still unsaved when the page is left.
  useEffect(
    () => () => {
      if (latest.current !== saved.current) void apiOk(UpdateJobNotes(jobId, latest.current))
    },
    [jobId],
  )

  return (
    <Panel
      title="Notes"
      action={
        <div className="flex items-center gap-3">
          <span className={`font-mono text-[11px] ${state === 'error' ? 'text-danger' : state === 'saved' ? 'text-success' : 'text-ink-3'}`}>
            {STATE_LABEL[state]}
          </span>
          <button className="text-xs text-ink-2 hover:text-ink" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
      }
    >
      {preview ? (
        <div className="min-h-48">{text.trim() ? <Markdown text={text} /> : <p className="text-xs text-ink-3">Nothing written yet.</p>}</div>
      ) : (
        <textarea
          className="field min-h-48 resize-y font-mono text-[13px] leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Prep notes, questions to ask, salary research…\nMarkdown works: **bold**, - lists, # headings'}
        />
      )}
    </Panel>
  )
}
