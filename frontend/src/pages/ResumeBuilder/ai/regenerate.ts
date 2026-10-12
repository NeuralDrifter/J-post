// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { app } from '../../../lib/backend'
import type { SectionReview } from '../../../lib/resumes/ai/review'
import type { AIDocument } from './aiDocument'
import type { RedoTarget } from './redoTargets'
import { useAIReview } from './reviewStore'

/** What a task needs to ask again about one section: the document now, the run being redone, what not to repeat. */
export type RegenerateArgs = { data: unknown; gen: app.AIGeneration; sectionId: string; avoid: readonly string[] }

/** A task's material for one section; null when the section has nothing it can work on. */
export type Regenerator = (args: RegenerateArgs) => Pick<app.ResumeAIRequest, 'input' | 'context'> | null

/** Tasks that can redo one section, by task id. Each feature adds its own. */
export const REGENERATORS: Partial<Record<string, Regenerator>> = {}

export const sectionRunKey = (sectionId: string) => `section:${sectionId}`

export const canRegenerate = (task: string) => Boolean(REGENERATORS[task])

/** Asks the shown run's task again for this section only, optionally with another provider or model. */
export async function regenerateSection<T>(doc: AIDocument<T>, review: SectionReview<T>, avoid: readonly string[], target?: RedoTarget): Promise<void> {
  const { gen } = review.shown
  const material = REGENERATORS[gen.task]?.({ data: doc.editor.getState().data, gen, sectionId: review.sectionId, avoid })
  if (!material) return
  await useAIReview.getState().run(sectionRunKey(review.sectionId), {
    task: gen.task,
    documentId: doc.docId,
    sectionKey: review.sectionId,
    jobId: gen.jobId,
    posting: gen.jobId ? '' : gen.posting,
    provider: target?.provider ?? '',
    model: target?.model ?? '',
    ...material,
  } as app.ResumeAIRequest)
}
