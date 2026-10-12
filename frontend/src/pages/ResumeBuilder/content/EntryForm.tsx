// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Plus, Trash2 } from 'lucide-react'
import { EMPTY_RESUME_DATES, type ResumeDates } from '@reactive-resume/schema/resume/dates'
import type { RoleItem } from '@reactive-resume/schema/resume/data'
import { generateId } from '@reactive-resume/utils/string'
import { Field } from '../../../components/Field'
import { IconButton } from '../../../components/IconButton'
import { useResume } from '../editorContext'
import { DatesField, KeywordsField, LevelField, TextInput, WebsiteField, type DateSettings, type Website } from './fields'
import type { FieldSpec } from './fieldSets'
import { IconPicker } from '../ui/IconPicker'
import { RichTextField } from './RichTextField'

type Values = Record<string, unknown>

/** Where an entry (or one of its roles) sits, so its rich-text fields can be improved by AI. */
export type EntryPlace = { sectionId: string; itemId: string; roleId?: string }

type FormProps = { fields: FieldSpec[]; values: Values; onChange: (key: string, value: unknown) => void; place?: EntryPlace }

/** The form for one entry, built from its field set; each change reports the changed property. */
export function EntryForm({ fields, values, onChange, place }: FormProps) {
  const page = useResume().metadata.page
  const dateSettings = { locale: page.locale, format: page.dateFormat }
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map((field) => (
        <FieldControl key={field.key} field={field} value={values[field.key]} dateSettings={dateSettings} onChange={(value) => onChange(field.key, value)} place={place} />
      ))}
    </div>
  )
}

type ControlProps = { field: FieldSpec; value: unknown; dateSettings: DateSettings; onChange: (value: unknown) => void; place?: EntryPlace }

function FieldControl({ field, value, dateSettings, onChange, place }: ControlProps) {
  switch (field.kind) {
    case 'text':
      return <TextInput label={field.label} value={String(value ?? '')} placeholder={field.placeholder} wide={field.wide} onChange={onChange} />
    case 'rich':
      return (
        <div className="col-span-2">
          <RichTextField label={field.label} html={String(value ?? '')} onChange={onChange} ai={place && { ...place, field: field.key }} />
        </div>
      )
    case 'keywords':
      return <KeywordsField label={field.label} value={(value as string[] | undefined) ?? []} onChange={onChange} />
    case 'level':
      return <LevelField value={Number(value ?? 0)} onChange={onChange} />
    case 'website':
      return <WebsiteField value={(value as Website | undefined) ?? { url: '', label: '' }} onChange={onChange} />
    case 'dates':
      return <DatesField dates={(value as ResumeDates | undefined) ?? EMPTY_RESUME_DATES} single={field.single} settings={dateSettings} onChange={onChange} />
    case 'icon':
      return (
        <Field label="Icon">
          <IconPicker label="Icon" value={String(value ?? '')} onChange={onChange} />
        </Field>
      )
    case 'roles':
      return <RolesField roles={(value as RoleItem[] | undefined) ?? []} onChange={onChange} place={place} />
  }
}

const ROLE_FIELDS: FieldSpec[] = [
  { kind: 'text', key: 'position', label: 'Position', wide: true },
  { kind: 'dates', key: 'dates', single: false },
  { kind: 'rich', key: 'description', label: 'Description' },
]

/** Roles held at one company, to show progression; each has its own position, dates and description. */
function RolesField({ roles, onChange, place }: { roles: RoleItem[]; onChange: (roles: RoleItem[]) => void; place?: EntryPlace }) {
  const update = (index: number, key: string, value: unknown) => onChange(roles.map((role, i) => (i === index ? { ...role, [key]: value } : role)))
  const add = () => onChange([...roles, { id: generateId(), position: '', period: '', dates: { ...EMPTY_RESUME_DATES }, description: '' }])
  return (
    <div className="col-span-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="label-mono">Roles at this company</span>
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={add}>
          <Plus size={13} /> Add role
        </button>
      </div>
      {roles.length === 0 && <p className="text-xs text-ink-3">Optional: list each role you held here to show progression.</p>}
      {roles.map((role, index) => (
        <div key={role.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-2">Role {index + 1}</span>
            <IconButton label="Remove role" onClick={() => onChange(roles.filter((r) => r.id !== role.id))}>
              <Trash2 size={13} />
            </IconButton>
          </div>
          <EntryForm fields={ROLE_FIELDS} values={role as unknown as Values} onChange={(key, value) => update(index, key, value)} place={place && { ...place, roleId: role.id }} />
        </div>
      ))}
    </div>
  )
}
