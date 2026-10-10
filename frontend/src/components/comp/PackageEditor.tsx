// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState, type SubmitEvent, type ReactNode } from 'react'
import { labelFor } from '../../lib/format'
import { TriangleAlert } from 'lucide-react'
import { NATIONAL_AREA } from '../../generated/choices'
import { api } from '../../lib/api'
import { DescribeArea, DescribeOccupation, PreviewComp, SaveCompPackage, SearchAreas, SearchOccupations, type comp } from '../../lib/backend'
import { EQUITY_LABEL, formatMoneyFull, KIND_LABEL, percentileLabel, STATES, VESTING_LABEL } from '../../lib/comp'
import { notifyDataChanged } from '../../lib/events'
import { colDetail, marketDetail, taxDetail, useSources } from '../../lib/sources'
import { toast } from '../../lib/toast'
import { Field } from '../Field'
import { LabelSelect } from '../LabelSelect'
import { Modal } from '../Modal'
import { SourceMark } from '../SourceMark'
import { CodePicker } from './CodePicker'

type NumKey = { [K in keyof comp.CompPackage]: comp.CompPackage[K] extends number ? K : never }[keyof comp.CompPackage]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-2xl border border-line p-4">
      <legend className="label-mono px-1">{title}</legend>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </fieldset>
  )
}

export function PackageEditor({ initial, onClose }: { initial: comp.CompPackage; onClose: () => void }) {
  const [p, setP] = useState(initial)
  const [preview, setPreview] = useState<comp.PackageResult>()
  const [saving, setSaving] = useState(false)
  const sources = useSources()

  const set = <K extends keyof comp.CompPackage>(key: K, value: comp.CompPackage[K]) => setP((cur) => ({ ...cur, [key]: value }))

  const num = (key: NumKey, label: string, opts: { prefix?: string; suffix?: string; step?: number } = {}) => (
    <Field label={label}>
      <div className="relative">
        {opts.prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-3">{opts.prefix}</span>}
        <input
          className={`field ${opts.prefix ? 'pl-6' : ''} ${opts.suffix ? 'pr-8' : ''}`}
          type="number"
          min={0}
          step={opts.step ?? 'any'}
          value={p[key] || ''}
          placeholder="0"
          onChange={(e) => set(key, Math.max(0, Number(e.target.value) || 0))}
        />
        {opts.suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-3">{opts.suffix}</span>}
      </div>
    </Field>
  )

  // Live preview, debounced; errors here are expected mid-edit, so no toasts.
  useEffect(() => {
    const timer = setTimeout(() => {
      PreviewComp(p).then(setPreview, () => setPreview(undefined))
    }, 300)
    return () => clearTimeout(timer)
  }, [p])

  const customSum = p.vestingCustom
    .split(',')
    .map((s) => Number(s.trim()) || 0)
    .reduce((a, b) => a + b, 0)

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    setSaving(true)
    const saved = await api(SaveCompPackage(p))
    setSaving(false)
    if (!saved) return
    notifyDataChanged()
    toast.success(`${labelFor(KIND_LABEL, saved.kind)} saved`)
    onClose()
  }

  return (
    <Modal title={`${p.id ? 'Edit' : 'New'} ${labelFor(KIND_LABEL, p.kind).toLowerCase()}`} onClose={onClose} width="max-w-3xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Label">
          <input className="field" value={p.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Initial offer" />
        </Field>

        <Section title="Cash">
          {num('baseSalary', 'Base salary', { prefix: '$', step: 1000 })}
          {num('targetBonusPct', 'Target bonus', { suffix: '%' })}
          {num('signingBonus', 'Signing bonus', { prefix: '$', step: 1000 })}
          {num('signingClawbackMonths', 'Repay signing if leaving within', { suffix: 'mo', step: 1 })}
          {num('annualRaisePct', 'Expected yearly raise', { suffix: '%' })}
        </Section>

        <Section title="Equity">
          <Field label="Type">
            <LabelSelect labels={EQUITY_LABEL} value={p.equityType} onChange={(v) => set('equityType', v)} />
          </Field>
          {p.equityType !== 'none' && (
            <Field label="Vesting">
              <LabelSelect labels={VESTING_LABEL} value={p.vesting} onChange={(v) => set('vesting', v)} />
            </Field>
          )}
          {p.equityType === 'rsu' && num('rsuGrantValue', 'Total grant value (4 years)', { prefix: '$', step: 1000 })}
          {p.equityType === 'options' && (
            <>
              {num('optionShares', 'Number of options', { step: 1 })}
              {num('optionStrike', 'Strike price', { prefix: '$', step: 0.01 })}
              {num('shareValue', 'Current value per share', { prefix: '$', step: 0.01 })}
            </>
          )}
          {p.equityType !== 'none' && p.vesting === 'custom' && (
            <Field label={`Yearly % (sum ${customSum}%)`}>
              <input
                className={`field ${customSum === 100 ? '' : 'border-warn/60'}`}
                value={p.vestingCustom}
                onChange={(e) => set('vestingCustom', e.target.value)}
                placeholder="10, 20, 30, 40"
              />
            </Field>
          )}
        </Section>

        <Section title="Benefits">
          {num('k401MatchPct', '401(k) match', { suffix: '%' })}
          {num('k401MatchCapPct', 'Matched up to (of salary)', { suffix: '%' })}
          {num('k401ContribPct', 'You contribute', { suffix: '%' })}
          {num('healthPremiumAnnual', 'Your health premium / yr', { prefix: '$', step: 100 })}
          {num('stipendsAnnual', 'Stipends / yr', { prefix: '$', step: 100 })}
          {num('otherAnnual', 'Other benefits / yr', { prefix: '$', step: 100 })}
          {num('ptoDays', 'PTO days', { step: 1 })}
        </Section>

        <Section title="Location & taxes">
          <Field label="Occupation (for market pay)">
            <CodePicker
              value={p.occupationCode}
              onChange={(code) => set('occupationCode', code)}
              search={SearchOccupations}
              describe={DescribeOccupation}
              placeholder="e.g. Software Developers"
            />
          </Field>
          <Field label="Work location">
            <CodePicker
              value={p.areaCode}
              onChange={(code, o) => {
                // A remote (national) area has no tax state of its own, so keep the one already picked.
                const areaState = o && o.code !== NATIONAL_AREA ? o.state : ''
                setP((cur) => ({ ...cur, areaCode: code, taxState: areaState || cur.taxState }))
              }}
              search={SearchAreas}
              describe={DescribeArea}
              placeholder="City / metro, or Remote"
            />
          </Field>
          <Field label="State income tax">
            <select className="field" value={p.taxState} onChange={(e) => set('taxState', e.target.value)}>
              <option value="">No state tax</option>
              {STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          {num('localTaxPct', 'Local / city income tax', { suffix: '%', step: 0.1 })}
        </Section>

        <Field label="Notes">
          <textarea className="field" rows={2} value={p.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        {preview && (
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
            <p className="label-mono mb-2">Preview</p>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <PreviewStat label="Year-1 total" value={formatMoneyFull(preview.year1Total)} />
              <PreviewStat
                label="Year-1 take-home"
                value={
                  <>
                    {formatMoneyFull(preview.year1TakeHome)}
                    <SourceMark source="tax" detail={taxDetail(preview.tax1)} />
                  </>
                }
              />
              <PreviewStat
                label="Market"
                value={
                  preview.market ? (
                    <>
                      {percentileLabel(preview.market)} pct
                      <SourceMark source="bls" detail={marketDetail(preview.market, sources)} />
                    </>
                  ) : (
                    '—'
                  )
                }
              />
              <PreviewStat
                label="In your home's dollars"
                value={
                  <>
                    {formatMoneyFull(preview.year1ColAdjusted)}
                    <SourceMark source="bea" detail={colDetail(preview, sources)} />
                  </>
                }
              />
            </div>
            {preview.warnings.map((w) => (
              <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PreviewStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">{label}</p>
      <p className="font-mono text-base font-bold">{value}</p>
    </div>
  )
}
