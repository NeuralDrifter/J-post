// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ChangeEvent, ReactNode } from 'react'
import { STATUSES, STATUS_LABEL, WORK_MODE_LABEL } from '../lib/format'
import type { JobDraft } from '../lib/jobDraft'

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block space-y-1.5 ${wide ? 'col-span-2' : ''}`}>
      <span className="label-mono">{label}</span>
      {children}
    </label>
  )
}

/** Shared create/edit fields. Status is only chosen on create; edits use ChangeStatus. */
export function JobForm({ draft, onChange, mode }: { draft: JobDraft; onChange: (d: JobDraft) => void; mode: 'create' | 'edit' }) {
  const set = (key: keyof JobDraft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...draft, [key]: e.target.value })

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Company">
        <input className="field" required autoFocus value={draft.company} onChange={set('company')} placeholder="e.g. Stripe" />
      </Field>
      <Field label="Position">
        <input className="field" required value={draft.position} onChange={set('position')} placeholder="e.g. Senior Engineer" />
      </Field>
      {mode === 'create' && (
        <Field label="Status">
          <select className="field" value={draft.status} onChange={set('status')}>
            {STATUSES.filter((s) => s !== 'closed').map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Work mode">
        <select className="field" value={draft.workMode} onChange={set('workMode')}>
          <option value="">Not specified</option>
          {Object.entries(WORK_MODE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location" wide={mode === 'edit'}>
        <input className="field" value={draft.location} onChange={set('location')} placeholder="City, state or Remote" />
      </Field>
      <Field label="Posting URL" wide>
        <input className="field" value={draft.url} onChange={set('url')} placeholder="https://…" />
      </Field>
      <Field label="Salary min">
        <input className="field" inputMode="numeric" value={draft.salaryMin} onChange={set('salaryMin')} placeholder="e.g. 120k" />
      </Field>
      <Field label="Salary max">
        <input className="field" inputMode="numeric" value={draft.salaryMax} onChange={set('salaryMax')} placeholder="e.g. 150k" />
      </Field>
      {mode === 'edit' && (
        <>
          <Field label="Date applied">
            <input className="field" type="date" value={draft.dateApplied} onChange={set('dateApplied')} />
          </Field>
          <Field label="Follow up on">
            <input className="field" type="date" value={draft.followUpOn} onChange={set('followUpOn')} />
          </Field>
        </>
      )}
    </div>
  )
}
