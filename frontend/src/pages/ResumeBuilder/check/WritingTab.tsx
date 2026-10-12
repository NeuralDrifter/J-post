// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { app } from '../../../lib/backend'
import type { ResumeData } from '../../../lib/resumes/document'
import { SETTINGS_TASK } from '../../../lib/resumes/ai/tasks'
import { writingReviewMaterial } from '../../../lib/resumes/ai/writingReview'
import { useReview } from '../ai/ReviewContext'
import { useAIReview } from '../ai/reviewStore'
import { TaskRun, WaitingSections } from '../ai/TaskRun'

const RUN_KEY = 'writing-review'

/** Writing: an AI read of every bullet and paragraph for weak writing, as rewrites to review. Never scored. */
export function WritingTab({ doc }: { doc: app.Document }) {
  const { doc: aiDoc } = useReview<ResumeData>()
  const run = () => {
    const material = writingReviewMaterial(aiDoc.passages(aiDoc.editor.getState().data))
    if (!material) return
    void useAIReview.getState().run(RUN_KEY, { task: SETTINGS_TASK.review, documentId: doc.id, sectionKey: '', jobId: '', posting: '', ...material } as app.ResumeAIRequest)
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-2">Looks for weak verbs, vague claims, missing results, repetition and bullets that run long. It isn't part of the score.</p>
      <TaskRun task={SETTINGS_TASK.review} runKey={RUN_KEY} label="Review my writing" busyLabel="Reviewing…" sends="every bullet and paragraph of your resume" disabled={doc.locked} onRun={run} />
      <WaitingSections task={SETTINGS_TASK.review} />
    </div>
  )
}
