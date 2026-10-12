// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo } from 'react'
import type { Passage } from '@reactive-resume/resume/proposals'
import { useStore, type StoreApi } from 'zustand'
import { apiOk } from '../../../lib/api'
import { CommitAIVersion, type app } from '../../../lib/backend'
import { notifyDataChanged } from '../../../lib/events'
import type { Change, Compiled } from '../../../lib/resumes/ai/changes'
import { commitMessage } from '../../../lib/resumes/ai/commitMessage'
import { sectionReviews, type SectionReview } from '../../../lib/resumes/ai/review'
import { toast } from '../../../lib/toast'
import type { EditorState } from '../editorStore'
import { anyAccepted, useAIReview } from './reviewStore'

/** What the AI review needs from an open document, resume or letter. */
export type AIDocument<T> = {
  docId: string
  editor: StoreApi<EditorState<T>>
  compile: (data: T, gen: app.AIGeneration) => Compiled<T>
  serialize: (data: T) => string
  plainText: (data: T) => string
  sectionTitle: (data: T, sectionId: string) => string
  /** Every passage an edit can name, as it is now. */
  passages: (data: T) => Passage[]
}

/** Every section's suggestions, worked out against the document as it is now. */
export function useSectionReviews<T>(doc: AIDocument<T>): SectionReview<T>[] {
  const data = useStore(doc.editor, (s) => s.data)
  const generations = useAIReview((s) => s.generations)
  const picked = useAIReview((s) => s.picked)
  const compiled = useMemo(() => generations.map((gen) => ({ gen, ...doc.compile(data, gen) })), [data, generations, doc])
  return useMemo(() => sectionReviews(compiled, picked), [compiled, picked])
}

/**
 * Applies a run's waiting changes as one undo step and records them in History: "Before AI edit" ahead of the
 * run's first accept, then a version named for what changed.
 */
export async function acceptChanges<T>(doc: AIDocument<T>, gen: app.AIGeneration, changes: readonly Change<T>[]): Promise<void> {
  const pending = changes.filter((c) => c.status === 'pending')
  const editor = doc.editor.getState()
  if (pending.length === 0) return
  if (editor.locked) return void toast.error('This document is locked. Unlock it to accept changes.')
  const before = editor.data
  if (!anyAccepted(gen) && !(await commit(doc, 'before-ai', 'Before AI edit', before))) return
  editor.update((draft) => {
    for (const change of pending) change.apply(draft)
  })
  const after = doc.editor.getState().data
  if (after === before) return void toast.error('Those changes no longer fit the document.')
  await useAIReview.getState().decide(gen.id, Object.fromEntries(pending.map((c) => [c.key, 'accepted'])))
  const job = useAIReview.getState().jobs[gen.jobId]
  const sections = pending.map((c) => doc.sectionTitle(after, c.sectionId))
  await commit(doc, 'ai', commitMessage({ task: gen.task, sections, job, model: gen.model || gen.provider }), after)
  notifyDataChanged()
}

export function rejectChanges<T>(gen: app.AIGeneration, changes: readonly Change<T>[]): Promise<boolean> {
  return useAIReview.getState().decide(gen.id, Object.fromEntries(changes.map((c) => [c.key, 'rejected'])))
}

/** Takes a rejection back: the change waits again. */
export function reopenChanges<T>(gen: app.AIGeneration, changes: readonly Change<T>[]): Promise<boolean> {
  return useAIReview.getState().decide(gen.id, Object.fromEntries(changes.map((c) => [c.key, null])))
}

function commit<T>(doc: AIDocument<T>, kind: 'ai' | 'before-ai', name: string, data: T): Promise<boolean> {
  return apiOk(CommitAIVersion(doc.docId, kind, name, doc.serialize(data), doc.plainText(data)))
}
