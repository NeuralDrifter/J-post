// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { CustomSectionType } from '@reactive-resume/schema/resume/data'

/** One control of an entry form. Keyed fields edit the entry property of that name. */
export type FieldSpec =
  | { kind: 'text'; key: string; label: string; placeholder?: string; wide?: boolean }
  | { kind: 'rich'; key: string; label: string }
  | { kind: 'keywords'; key: string; label: string }
  | { kind: 'level'; key: 'level' }
  | { kind: 'website'; key: 'website' }
  | { kind: 'dates'; key: 'dates'; single: boolean }
  | { kind: 'icon'; key: 'icon' }
  | { kind: 'roles'; key: 'roles' }

const text = (key: string, label: string, placeholder?: string, wide?: boolean): FieldSpec => ({ kind: 'text', key, label, placeholder, wide })
const rich = (key: string, label = 'Description'): FieldSpec => ({ kind: 'rich', key, label })
const keywords: FieldSpec = { kind: 'keywords', key: 'keywords', label: 'Keywords' }
const level: FieldSpec = { kind: 'level', key: 'level' }
const website: FieldSpec = { kind: 'website', key: 'website' }
const icon: FieldSpec = { kind: 'icon', key: 'icon' }
const period: FieldSpec = { kind: 'dates', key: 'dates', single: false }
const date: FieldSpec = { kind: 'dates', key: 'dates', single: true }

/** What each kind of entry asks for, in form order. */
export const FIELD_SETS: Record<CustomSectionType, FieldSpec[]> = {
  experience: [text('position', 'Position'), text('company', 'Company'), text('location', 'Location'), period, website, rich('description'), { kind: 'roles', key: 'roles' }],
  education: [text('school', 'School'), text('degree', 'Degree'), text('area', 'Area of study'), text('grade', 'Grade'), text('location', 'Location'), period, website, rich('description')],
  projects: [text('name', 'Name', undefined, true), period, website, rich('description')],
  skills: [text('name', 'Skill'), text('proficiency', 'Proficiency', 'e.g. Advanced'), level, icon, keywords],
  languages: [text('language', 'Language'), text('fluency', 'Fluency', 'e.g. Native'), level],
  interests: [text('name', 'Interest'), icon, keywords],
  awards: [text('title', 'Title'), text('awarder', 'Awarded by'), date, website, rich('description')],
  certifications: [text('title', 'Title'), text('issuer', 'Issued by'), date, website, rich('description')],
  publications: [text('title', 'Title'), text('publisher', 'Publisher'), date, website, rich('description')],
  volunteer: [text('organization', 'Organization'), text('location', 'Location'), period, website, rich('description')],
  references: [text('name', 'Name'), text('position', 'Position'), text('phone', 'Phone'), website, rich('description', 'Note')],
  profiles: [text('network', 'Network', 'e.g. LinkedIn'), text('username', 'Username'), icon, website],
  summary: [rich('content', 'Text')],
  'cover-letter': [rich('recipient', 'Recipient'), rich('content', 'Letter')],
}

export function fieldKeys(fields: FieldSpec[]): string[] {
  return fields.map((field) => field.key)
}
