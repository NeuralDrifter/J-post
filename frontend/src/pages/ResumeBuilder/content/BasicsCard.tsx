// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { IdCard, Plus, Trash2 } from 'lucide-react'
import type { Basics, CustomField } from '@reactive-resume/schema/resume/data'
import { generateId } from '@reactive-resume/utils/string'
import { IconButton } from '../../../components/IconButton'
import { useResume, useUpdate } from '../editorContext'
import { Fold } from '../ui/controls'
import { TextInput } from './fields'

type TextKey = 'name' | 'headline' | 'email' | 'phone' | 'location'

const TEXT_FIELDS: { key: TextKey; label: string; placeholder?: string }[] = [
  { key: 'name', label: 'Full name' },
  { key: 'headline', label: 'Headline', placeholder: 'e.g. Senior Backend Engineer' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'location', label: 'Location', placeholder: 'City, Country' },
]

export type EditBasics = (mutate: (basics: Basics) => void) => void

/** The resume's name, headline and contact details, plus any extra lines for the header. */
export function BasicsCard() {
  const basics = useResume().basics
  const update = useUpdate()
  return (
    <Fold title="Basics" icon={<IdCard size={15} className="shrink-0 text-indigo-300" />} defaultOpen>
      <BasicsForm basics={basics} edit={(mutate) => update((d) => mutate(d.basics))} />
    </Fold>
  )
}

/** Name, headline, contact details and extra header lines, for a resume or a letter's sender. */
export function BasicsForm({ basics, edit }: { basics: Basics; edit: EditBasics }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {TEXT_FIELDS.map(({ key, label, placeholder }) => (
          <TextInput key={key} label={label} placeholder={placeholder} value={basics[key]} wide={key === 'headline'} onChange={(v) => edit((b) => void (b[key] = v))} />
        ))}
        <TextInput label="Website" placeholder="https://" value={basics.website.url} onChange={(v) => edit((b) => void (b.website.url = v))} />
        <TextInput label="Link text" placeholder="Shown instead of the URL" value={basics.website.label} onChange={(v) => edit((b) => void (b.website.label = v))} />
      </div>
      <CustomFields fields={basics.customFields} edit={edit} />
    </>
  )
}

function CustomFields({ fields, edit }: { fields: CustomField[]; edit: EditBasics }) {
  const setField = (id: string, patch: Partial<CustomField>) =>
    edit((b) => {
      const field = b.customFields.find((f) => f.id === id)
      if (field) Object.assign(field, patch)
    })
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="label-mono">Extra header lines</span>
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => edit((b) => void b.customFields.push({ id: generateId(), icon: '', text: '', link: '' }))}>
          <Plus size={13} /> Add
        </button>
      </div>
      {fields.map((field) => (
        <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <input className="field py-1.5 text-xs" placeholder="Text, e.g. Open to relocation" value={field.text} onChange={(e) => setField(field.id, { text: e.target.value })} aria-label="Text" />
          <input className="field py-1.5 text-xs" placeholder="Link (optional)" value={field.link} onChange={(e) => setField(field.id, { link: e.target.value })} aria-label="Link" />
          <IconButton label="Remove line" onClick={() => edit((b) => void (b.customFields = b.customFields.filter((f) => f.id !== field.id)))}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
