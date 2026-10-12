// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useNavigate } from 'react-router'
import { RefreshCw, Sparkles } from 'lucide-react'
import type { app } from '../../../lib/backend'
import type { MenuEntry } from '../../../lib/menu'
import type { ResumeData } from '../../../lib/resumes/document'
import { textsToAvoid } from '../../../lib/resumes/ai/review'
import { parseTailorTerms, tailorMaterial } from '../../../lib/resumes/ai/tailor'
import { SETTINGS_TASK } from '../../../lib/resumes/ai/tasks'
import type { AIDocument } from './aiDocument'
import { redoMenuItem, useRedoTargets } from './redoTargets'
import { canRegenerate, regenerateSection, sectionRunKey } from './regenerate'
import { useReview, useSectionReview } from './ReviewContext'
import { useAIReview } from './reviewStore'

/** The newest tailor run on this resume: its job (or pasted posting) and terms are what a section run reuses. */
export const latestTailorRun = (generations: readonly app.AIGeneration[]) => generations.filter((g) => g.task === SETTINGS_TASK.tailor).at(-1)

/** Tailors one section to the posting of the latest tailor run. */
function tailorSection(doc: AIDocument<ResumeData>, run: app.AIGeneration, sectionId: string) {
  const data = doc.editor.getState().data
  const material = tailorMaterial(data, doc.passages(data), parseTailorTerms(run.context), { section: sectionId })
  void useAIReview.getState().run(sectionRunKey(sectionId), {
    task: SETTINGS_TASK.tailor,
    documentId: doc.docId,
    sectionKey: sectionId,
    jobId: run.jobId,
    posting: run.jobId ? '' : run.posting,
    ...material,
  } as app.ResumeAIRequest)
}

/**
 * A section's AI entries for its right-click menu: Tailor this section (to the posting last tailored to, or the
 * Tailor panel to pick one), and Regenerate / Redo with for the suggestions it shows.
 */
export function useSectionAIMenu(sectionId: string): MenuEntry[] {
  const { doc } = useReview<ResumeData>()
  const review = useSectionReview<ResumeData>(sectionId)
  const generations = useAIReview((s) => s.generations)
  const targets = useRedoTargets()
  const navigate = useNavigate()
  const run = latestTailorRun(generations)
  const tailor: MenuEntry = {
    label: 'Tailor this section',
    icon: Sparkles,
    onSelect: () => (run ? tailorSection(doc, run, sectionId) : navigate({ search: '?panel=tailor' })),
  }
  if (!review || !canRegenerate(review.shown.gen.task)) return [tailor]
  const regenerate = (target?: Parameters<typeof regenerateSection>[3]) => void regenerateSection(doc, review, textsToAvoid(review), target)
  return [tailor, { label: 'Regenerate suggestions', icon: RefreshCw, onSelect: () => regenerate() }, redoMenuItem(targets, regenerate)]
}
