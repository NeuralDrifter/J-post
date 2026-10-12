// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Loader2, Sparkles } from 'lucide-react'
import { settingsLink } from '../../../lib/settingsNav'
import type { ResumeData } from '../../../lib/resumes/document'
import { useEditor } from '../editorContext'
import { useReview } from './ReviewContext'
import { useAIReview } from './reviewStore'
import { useTaskProvider } from './taskProvider'

type TaskRunProps = {
  task: string
  /** The run's key in the review store: its progress and error. */
  runKey: string
  label: string
  busyLabel: string
  /** What the run sends, finished with "to <provider>." */
  sends: string
  disabled: boolean
  onRun: () => void
}

/** A panel's AI run: the button, what it sends and to whom, and the run's error. */
export function TaskRun({ task, runKey, label, busyLabel, sends, disabled, onRun }: TaskRunProps) {
  const provider = useTaskProvider(task)
  const running = useAIReview((s) => s.running[runKey] ?? false)
  const error = useAIReview((s) => s.errors[runKey])
  return (
    <div className="space-y-1.5">
      <button type="button" className="btn btn-primary py-1 text-xs" disabled={disabled || running || !!provider.unavailable} onClick={onRun}>
        {running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {running ? busyLabel : label}
      </button>
      <Note>
        Sends {sends} to {provider.label}. Every change waits for you to accept it.
      </Note>
      {provider.unavailable && (
        <p className="text-[11px] text-warn">
          {provider.unavailable}{' '}
          <Link to={settingsLink('features')} className="underline underline-offset-2">
            Choose another in Settings
          </Link>
        </p>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  )
}

const Note = ({ children }: { children: ReactNode }) => <p className="text-[11px] text-ink-3">{children}</p>

/** Sections whose changes from a task are waiting; picking one shows it in the content panel. */
export function WaitingSections({ task }: { task: string }) {
  const { doc, reviews } = useReview<ResumeData>()
  const data = useEditor((s) => s.data) as ResumeData
  const waiting = reviews.filter((r) => r.shown.gen.task === task && r.pending > 0)
  if (waiting.length === 0) return null
  return (
    <section className="space-y-1.5">
      <h3 className="label-mono">Changes to review</h3>
      {waiting.map((r) => (
        <button
          key={r.sectionId}
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-white/5"
          onClick={() => document.querySelector(`[data-review="${CSS.escape(r.sectionId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
        >
          {doc.sectionTitle(data, r.sectionId)}
          <span className="text-ink-3">{r.pending}</span>
        </button>
      ))}
    </section>
  )
}
