// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import type { app } from '../../lib/backend'
import { letterDraftMaterial, type LetterTone } from '../../lib/resumes/ai/letterChanges'
import { SETTINGS_TASK } from '../../lib/resumes/ai/tasks'
import type { LetterData } from '../../lib/resumes/letter'
import { useAIReview } from '../ResumeBuilder/ai/reviewStore'
import { TaskRun } from '../ResumeBuilder/ai/TaskRun'
import { Segmented } from '../ResumeBuilder/ui/controls'

const RUN_KEY = 'letter-draft'

const TONES: { value: LetterTone; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'warm', label: 'Warm' },
  { value: 'formal', label: 'Formal' },
]

type Length = 'short' | 'standard'

const LENGTHS: { value: Length; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'standard', label: 'Standard' },
]

const WORDS: Record<Length, { min: number; max: number }> = { short: { min: 120, max: 180 }, standard: { min: 180, max: 320 } }

/** Draft with AI: a body from the sender's resume and the job's posting, or edits to the body there is. */
export function DraftWithAI({ doc, letter }: { doc: app.Document; letter: LetterData }) {
  const [tone, setTone] = useState<LetterTone>('direct')
  const [length, setLength] = useState<Length>('standard')
  const [request, setRequest] = useState('')
  const [posting, setPosting] = useState('')
  const run = () => {
    const material = letterDraftMaterial(letter, { tone, words: WORDS[length], request: request.trim() })
    void useAIReview.getState().run(RUN_KEY, { task: SETTINGS_TASK.letter, documentId: doc.id, sectionKey: '', jobId: doc.jobId, posting: doc.jobId ? '' : posting.trim(), ...material } as app.ResumeAIRequest)
  }
  return (
    <div className="space-y-2 rounded-2xl border border-line p-3">
      <div className="flex flex-wrap gap-2">
        <Segmented<LetterTone> label="Tone" options={TONES} value={tone} onChange={setTone} />
        <Segmented<Length> label="Length" options={LENGTHS} value={length} onChange={setLength} />
      </div>
      {!doc.jobId && (
        <textarea className="field min-h-20 resize-y text-xs" placeholder="Paste the job posting (optional)…" value={posting} onChange={(e) => setPosting(e.target.value)} aria-label="Job posting" />
      )}
      <input className="field py-1.5 text-xs" placeholder="Anything to ask for? e.g. mention the open-source work" value={request} onChange={(e) => setRequest(e.target.value)} aria-label="Request" />
      <TaskRun
        task={SETTINGS_TASK.letter}
        runKey={RUN_KEY}
        label="Draft with AI"
        busyLabel="Drafting…"
        sends={`your resume, ${doc.jobId ? "the job's posting and notes" : 'the posting'} and this letter's body`}
        disabled={doc.locked}
        onRun={run}
      />
    </div>
  )
}
