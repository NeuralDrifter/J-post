// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ChangeEvent } from 'react'
import { STATUSES, STATUS_LABEL, WORK_MODE_LABEL } from '../lib/format'
import type { JobDraft } from '../lib/jobDraft'
import { Field } from './Field'
import { LabelSelect } from './LabelSelect'

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
          <LabelSelect
            labels={STATUS_LABEL}
            values={STATUSES.filter((s) => s !== 'closed')}
            value={draft.status}
            onChange={(status) => onChange({ ...draft, status })}
          />
        </Field>
      )}
      <Field label="Work mode">
        <LabelSelect labels={WORK_MODE_LABEL} empty="Not specified" value={draft.workMode} onChange={(workMode) => onChange({ ...draft, workMode })} />
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
