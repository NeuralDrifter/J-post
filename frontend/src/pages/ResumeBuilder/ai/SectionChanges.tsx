// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type MouseEvent } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react'
import { AI_TASKS } from '../../../generated/choices'
import { openMenu, type MenuEntry } from '../../../lib/menu'
import type { Change } from '../../../lib/resumes/ai/changes'
import { textsToAvoid, versionPosition, type SectionReview } from '../../../lib/resumes/ai/review'
import { acceptChanges, rejectChanges, reopenChanges, type AIDocument } from './aiDocument'
import { ChangeRow } from './ChangeRow'
import { redoMenuItem, useRedoTargets, type RedoTarget } from './redoTargets'
import { canRegenerate, regenerateSection, sectionRunKey } from './regenerate'
import { useReview, useSectionReview } from './ReviewContext'
import { useAIReview } from './reviewStore'

const taskLabel = (task: string) => AI_TASKS.find((t) => t.id === task)?.label ?? 'AI'

/** A section's AI suggestions, as Track Changes; nothing when it has none. */
export function SectionChanges({ sectionId }: { sectionId: string }) {
  const review = useSectionReview(sectionId)
  const running = useAIReview((s) => s.running[sectionRunKey(sectionId)])
  const error = useAIReview((s) => s.errors[sectionRunKey(sectionId)])
  if (!review && !running && !error) return null
  return (
    <div data-review={sectionId} className="mt-2 space-y-2 rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.04] p-2.5">
      {review ? <ReviewBody key={review.shown.gen.id} review={review} running={Boolean(running)} /> : <RunningLine />}
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  )
}

function RunningLine() {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-2">
      <LoaderCircle size={13} className="animate-spin" /> Asking the AI…
    </p>
  )
}

function ReviewBody<T>({ review, running }: { review: SectionReview<T>; running: boolean }) {
  const { doc } = useReview<T>()
  const [open, setOpen] = useState(review.pending > 0)
  const targets = useRedoTargets()
  const { gen } = review.shown
  const regenerate = (target?: RedoTarget) => void regenerateSection(doc, review, textsToAvoid(review), target)
  const sectionMenu: MenuEntry[] = canRegenerate(gen.task)
    ? [{ label: 'Regenerate this section', icon: RefreshCw, onSelect: () => regenerate() }, redoMenuItem(targets, regenerate)]
    : []
  const showRedo = (e: MouseEvent) => openMenu(e, [redoMenuItem(targets, regenerate)])

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Sparkles size={13} className="shrink-0 text-indigo-300" />
          <span className="truncate text-xs font-semibold">
            {taskLabel(gen.task)} · {gen.model || gen.provider}
          </span>
          <span className="shrink-0 text-[11px] text-ink-3">{review.pending > 0 ? `${review.pending} to review` : 'reviewed'}</span>
          <ChevronDown size={13} className={`shrink-0 text-ink-3 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <VersionSwitcher review={review} />
      </header>
      {open && (
        <>
          <ul className="space-y-1.5">
            {review.changes.map((change) => (
              <ChangeRow
                key={change.key}
                change={change}
                onAccept={() => void acceptChanges(doc, gen, [change])}
                onReject={() => void rejectChanges(gen, [change])}
                onReopen={() => void reopenChanges(gen, [change])}
                sectionMenu={sectionMenu}
              />
            ))}
          </ul>
          <SectionActions doc={doc} review={review} running={running} canRedo={sectionMenu.length > 0} onRegenerate={() => regenerate()} onRedo={showRedo} />
        </>
      )}
    </>
  )
}

function VersionSwitcher<T>({ review }: { review: SectionReview<T> }) {
  const pick = useAIReview((s) => s.pick)
  const { index, count } = versionPosition(review)
  if (count < 2) return null
  const go = (step: number) => pick(review.sectionId, review.versions[index + step].gen.id)
  return (
    <span className="flex items-center text-[11px] text-ink-2" aria-label="Versions">
      <button type="button" className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30" disabled={index === 0} onClick={() => go(-1)} aria-label="Older version">
        <ChevronLeft size={13} />
      </button>
      <span className="font-mono">
        {index + 1} / {count}
      </span>
      <button type="button" className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30" disabled={index === count - 1} onClick={() => go(1)} aria-label="Newer version">
        <ChevronRight size={13} />
      </button>
    </span>
  )
}

type ActionsProps<T> = { doc: AIDocument<T>; review: SectionReview<T>; running: boolean; canRedo: boolean; onRegenerate: () => void; onRedo: (e: MouseEvent) => void }

function SectionActions<T>({ doc, review, running, canRedo, onRegenerate, onRedo }: ActionsProps<T>) {
  const { gen } = review.shown
  const pending: Change<T>[] = review.changes.filter((c) => c.status === 'pending')
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className="btn btn-primary py-1 text-xs" disabled={pending.length === 0} onClick={() => void acceptChanges(doc, gen, pending)}>
        <Check size={13} /> Accept all
      </button>
      <button type="button" className="btn btn-ghost py-1 text-xs" disabled={pending.length === 0} onClick={() => void rejectChanges(gen, pending)}>
        <X size={13} /> Reject all
      </button>
      {canRedo && (
        <>
          <button type="button" className="btn btn-ghost py-1 text-xs" disabled={running} onClick={onRegenerate}>
            {running ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} Regenerate
          </button>
          <button type="button" className="btn btn-ghost py-1 text-xs" disabled={running} onClick={onRedo}>
            Redo with <ChevronDown size={12} />
          </button>
        </>
      )}
    </div>
  )
}
