// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { dateFormatSchema, type DateFormat } from '@reactive-resume/schema/resume/dates'
import { localeSchema } from '@reactive-resume/utils/locale'
import { applyDensity, applyMargins, matchDensity, matchMargins, type DensityId, type MarginId } from '@reactive-resume/web/features/resume/editor/design/presets'
import { Field } from '../../../components/Field'
import { useDesign } from './designContext'
import { Segmented, Toggle } from '../ui/controls'

type Format = 'a4' | 'letter' | 'free-form'

const FORMATS: { value: Format; label: string }[] = [
  { value: 'letter', label: 'Letter' },
  { value: 'a4', label: 'A4' },
  { value: 'free-form', label: 'One long page' },
]
const MARGINS: { value: MarginId; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
]
const DENSITIES: { value: DensityId; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'roomy', label: 'Roomy' },
]
const DATE_FORMAT_EXAMPLE: Record<DateFormat, string> = { short: 'Mar 2022', long: 'March 2022', numeric: '03/2022', iso: '2022-03' }

const languageName = new Intl.DisplayNames(['en'], { type: 'language' })

/** Paper size, margins and spacing, the resume's language and how dates and icons print. */
export function PageSection() {
  const { metadata, updateMetadata } = useDesign()
  const page = metadata.page
  const set = <K extends keyof typeof page>(key: K, value: (typeof page)[K]) => updateMetadata((m) => void (m.page[key] = value))

  return (
    <div className="space-y-4">
      <Labelled label="Paper">
        <Segmented<Format> label="Paper" options={FORMATS} value={page.format} onChange={(v) => set('format', v)} />
      </Labelled>
      <Labelled label="Margins">
        <Segmented<MarginId> label="Margins" options={MARGINS} value={matchMargins(metadata)} onChange={(id) => updateMetadata((m) => applyMargins(m, id))} />
      </Labelled>
      <Labelled label="Spacing">
        <Segmented<DensityId> label="Spacing" options={DENSITIES} value={matchDensity(metadata)} onChange={(id) => updateMetadata((m) => applyDensity(m, id))} />
      </Labelled>
      <Field label="Language of headings and dates">
        <select className="field" value={page.locale} onChange={(e) => set('locale', e.target.value)}>
          {localeSchema.options.map((locale) => (
            <option key={locale} value={locale}>
              {languageName.of(locale) ?? locale} ({locale})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Dates">
        <select className="field" value={page.dateFormat ?? 'short'} onChange={(e) => set('dateFormat', e.target.value as DateFormat)}>
          {dateFormatSchema.options.map((format) => (
            <option key={format} value={format}>
              {DATE_FORMAT_EXAMPLE[format]}
            </option>
          ))}
        </select>
      </Field>
      <Toggle label="Section icons" hint="Small icons before section titles." checked={!page.hideSectionIcons} onChange={(v) => set('hideSectionIcons', !v)} />
      <Toggle label="Item icons" hint="Icons on skills, profiles and interests." checked={!page.hideIcons} onChange={(v) => set('hideIcons', !v)} />
      <Toggle label="Underline links" checked={!page.hideLinkUnderline} onChange={(v) => set('hideLinkUnderline', !v)} />
    </div>
  )
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="label-mono">{label}</span>
      {children}
    </div>
  )
}
