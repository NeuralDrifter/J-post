// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { Draft } from 'immer'
import { IdCard, Mail } from 'lucide-react'
import { Field } from '../../components/Field'
import type { LetterData } from '../../lib/resumes/letter'
import { BasicsForm } from '../ResumeBuilder/content/BasicsCard'
import { RichTextField } from '../ResumeBuilder/content/RichTextField'
import { Fold, Segmented } from '../ResumeBuilder/ui/controls'

type Update = (recipe: (draft: Draft<LetterData>) => void) => void
type Layout = LetterData['layout']

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: 'structured', label: 'With greeting' },
  { value: 'freeform', label: 'As written' },
]

/** The letter itself: who it's to, the body, and who it's from. */
export function WritePanel({ letter, update }: { letter: LetterData; update: Update }) {
  return (
    <div className="space-y-2.5">
      <Fold title="Letter" icon={<Mail size={15} className="shrink-0 text-indigo-300" />} defaultOpen>
        <Segmented<Layout> label="Letter style" options={LAYOUTS} value={letter.layout} onChange={(v) => update((d) => void (d.layout = v))} />
        {letter.layout === 'structured' ? <StructuredRecipient letter={letter} update={update} /> : <FreeformRecipient letter={letter} update={update} />}
        <RichTextField label={letter.layout === 'structured' ? 'Body (between the greeting and the sign-off)' : 'Letter'} html={letter.content} onChange={(html) => update((d) => void (d.content = html))} minHeight="min-h-72" />
      </Fold>
      <Fold title="Sender" icon={<IdCard size={15} className="shrink-0 text-indigo-300" />}>
        <p className="text-xs text-ink-3">The header at the top of the letter. It started as a copy of a resume; changing it here changes only this letter.</p>
        <BasicsForm basics={letter.style.basics} edit={(mutate) => update((d) => mutate(d.style.basics))} />
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
