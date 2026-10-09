// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { CodePicker } from '../../components/comp/CodePicker'
import { Field } from '../../components/JobForm'
import { DescribeArea, DescribeOccupation, SearchAreas, SearchOccupations, type comp, type settings } from '../../lib/backend'
import { FILING_LABEL, formatMoneyFull } from '../../lib/comp'
import { Section } from './Section'

type Props = {
  s: settings.Settings
  setS: (s: settings.Settings) => void
  current: comp.CompPackage | null | undefined
  onEditCurrent: () => void // opens the current-job editor, a form of its own outside the settings form
}

/** Taxes, cost of living and market pay for the Offers page, plus the current-job baseline. */
export function CompensationSection({ s, setS, current, onEditCurrent }: Props) {
  return (
    <Section title="Compensation" hint="Used on the Offers page: taxes, cost of living, and market pay for your role.">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Federal filing status">
          <select className="field" value={s.filingStatus} onChange={(e) => setS({ ...s, filingStatus: e.target.value })}>
            {Object.entries(FILING_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Home location (for cost of living)">
          <CodePicker
            value={s.homeAreaCode}
            onChange={(code) => setS({ ...s, homeAreaCode: code || 'US' })}
            search={SearchAreas}
            describe={DescribeArea}
            placeholder="Where you live now"
          />
        </Field>
        <Field label="Your usual occupation" wide>
          <CodePicker
            value={s.defaultOccupation}
            onChange={(code) => setS({ ...s, defaultOccupation: code })}
            search={SearchOccupations}
            describe={DescribeOccupation}
            placeholder="e.g. Software Developers"
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            Current job baseline <span className="font-normal text-ink-3">(optional)</span>
          </p>
          <p className="font-mono text-xs text-ink-3">
            {current ? `${formatMoneyFull(current.baseSalary)} base · every offer shows the difference` : 'Skip this if you’re between jobs. Offers are still compared with each other.'}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onEditCurrent}>
          {current ? 'Edit' : 'Set up'}
        </button>
      </div>
    </Section>
  )
}
