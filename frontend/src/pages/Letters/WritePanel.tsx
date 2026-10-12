// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { Draft } from 'immer'
import { IdCard, Mail } from 'lucide-react'
import { LETTER_SECTION_ID, type ProposalTarget } from '@reactive-resume/resume/proposals'
import { countWords, LETTER_LENGTH, letterLength, type LetterLength } from '@reactive-resume/web/features/letters/length'
import { Field } from '../../components/Field'
import type { app } from '../../lib/backend'
import type { LetterData } from '../../lib/resumes/letter'
import { BasicsForm } from '../ResumeBuilder/content/BasicsCard'
import { RichTextField } from '../ResumeBuilder/content/RichTextField'
import { Fold, Segmented } from '../ResumeBuilder/ui/controls'
import { ReadOnly } from '../ResumeBuilder/ui/ReadOnly'
import { SectionChanges } from '../ResumeBuilder/ai/SectionChanges'
import { DraftWithAI } from './DraftWithAI'
import { JobLink, SourceResume } from './LetterLinks'

type Update = (recipe: (draft: Draft<LetterData>) => void) => void
type Layout = LetterData['layout']

const LETTER_BODY: ProposalTarget = { sectionId: LETTER_SECTION_ID, field: 'content' }

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: 'structured', label: 'With greeting' },
  { value: 'freeform', label: 'As written' },
]

/** The letter itself: the job it's for, who it's to, the body, and who it's from. */
export function WritePanel({ doc, letter, update }: { doc: app.Document; letter: LetterData; update: Update }) {
  return (
    <div className="space-y-2.5">
      <Fold title="Letter" icon={<Mail size={15} className="shrink-0 text-indigo-300" />} defaultOpen>
        <JobLink doc={doc} update={update} />
        <Segmented<Layout> label="Letter style" options={LAYOUTS} value={letter.layout} onChange={(v) => update((d) => void (d.layout = v))} />
        {letter.layout === 'structured' ? <StructuredRecipient letter={letter} update={update} /> : <FreeformRecipient letter={letter} update={update} />}
        <DraftWithAI doc={doc} letter={letter} />
        <RichTextField
          label={letter.layout === 'structured' ? 'Body (between the greeting and the sign-off)' : 'Letter'}
          html={letter.content}
          onChange={(html) => update((d) => void (d.content = html))}
          minHeight="min-h-72"
          ai={LETTER_BODY}
        />
        <SectionChanges sectionId={LETTER_SECTION_ID} />
        <LengthMeter html={letter.content} />
      </Fold>
      <Fold title="Sender" icon={<IdCard size={15} className="shrink-0 text-indigo-300" />}>
        <SourceResume doc={doc} letter={letter} update={update} />
        <p className="text-xs text-ink-3">
          {doc.senderLinked ? 'The header comes from the resume; edit it there.' : 'The header at the top of the letter. Changing it here changes only this letter.'}
        </p>
        <ReadOnly when={doc.senderLinked}>
          <BasicsForm basics={letter.style.basics} edit={(mutate) => update((d) => mutate(d.style.basics))} />
        </ReadOnly>
      </Fold>
    </div>
  )
}

function StructuredRecipient({ letter, update }: { letter: LetterData; update: Update }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="To">
        <input className="field" value={letter.recipientName} placeholder="Name, or e.g. Design team" onChange={(e) => update((d) => void (d.recipientName = e.target.value))} />
      </Field>
      <Field label="Company">
        <input className="field" value={letter.recipientCompany} onChange={(e) => update((d) => void (d.recipientCompany = e.target.value))} />
      </Field>
      <Field label="Date">
        <input type="date" className="field" value={letter.letterDate ?? ''} onChange={(e) => update((d) => void (d.letterDate = e.target.value || null))} />
      </Field>
    </div>
  )
}

function FreeformRecipient({ letter, update }: { letter: LetterData; update: Update }) {
  return <RichTextField label="Recipient block" html={letter.recipient} onChange={(html) => update((d) => void (d.recipient = html))} />
}

const LENGTH_NOTES: Record<LetterLength, string> = {
  empty: 'No words yet',
  short: 'On the short side',
  comfortable: 'A comfortable length',
  long: 'Longer than most recruiters read',
}

/** The body's length against what recruiters read (180 to 320 words). */
function LengthMeter({ html }: { html: string }) {
  const words = countWords(html)
  const verdict = letterLength(words)
  const tone = verdict === 'comfortable' ? 'bg-success' : verdict === 'empty' ? 'bg-white/20' : 'bg-warn'
  const percent = (value: number) => `${Math.min(100, (value / LETTER_LENGTH.scale) * 100)}%`
  return (
    <div className="space-y-1">
      <div role="meter" aria-label="Letter length" aria-valuemin={0} aria-valuemax={LETTER_LENGTH.scale} aria-valuenow={words} className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 bg-success/20" style={{ left: percent(LETTER_LENGTH.min), width: `calc(${percent(LETTER_LENGTH.max)} - ${percent(LETTER_LENGTH.min)})` }} />
        <div className={`relative h-full rounded-full ${tone}`} style={{ width: percent(words) }} />
      </div>
      <p className="text-[11px] text-ink-3">
        {words} word{words === 1 ? '' : 's'} · {LENGTH_NOTES[verdict]} (most read {LETTER_LENGTH.min} to {LETTER_LENGTH.max})
      </p>
    </div>
  )
}
