// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { FileWarning, X } from 'lucide-react'
import { IconButton } from '../../../components/IconButton'
import type { app } from '../../../lib/backend'
import { importTidyMaterial } from '../../../lib/resumes/ai/importTidy'
import { SETTINGS_TASK } from '../../../lib/resumes/ai/tasks'
import type { ResumeData } from '../../../lib/resumes/document'
import { forgetImportText, importTextFor } from '../../../lib/resumes/importText'
import { useEditor } from '../editorContext'
import { useAIReview } from './reviewStore'
import { TaskRun } from './TaskRun'

const RUN_KEY = 'import-tidy'

/** After a PDF or Word import: the offer to tidy what landed in the wrong place, for this app session. */
export function ImportTidyBanner({ doc }: { doc: app.Document }) {
  const [text, setText] = useState(() => importTextFor(doc.id))
  const data = useEditor((s) => s.data) as ResumeData
  if (!text) return null
  const dismiss = () => {
    forgetImportText(doc.id)
    setText('')
  }
  const run = async () => {
    const gen = await useAIReview.getState().run(RUN_KEY, { task: SETTINGS_TASK.tidyImport, documentId: doc.id, sectionKey: '', jobId: '', posting: '', ...importTidyMaterial(data, text) } as app.ResumeAIRequest)
    if (gen) dismiss()
  }
  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
      <div className="flex items-start gap-2">
        <FileWarning size={15} className="mt-0.5 shrink-0 text-amber-200" />
        <p className="flex-1 text-xs text-ink-2">Imported from a PDF or Word file. Some parts may have landed in the wrong place.</p>
        <IconButton label="Dismiss" onClick={dismiss}>
          <X size={13} />
        </IconButton>
      </div>
      <TaskRun task={SETTINGS_TASK.tidyImport} runKey={RUN_KEY} label="Tidy with AI" busyLabel="Tidying…" sends="the file's text and the imported sections" disabled={doc.locked} onRun={() => void run()} />
    </div>
  )
}
