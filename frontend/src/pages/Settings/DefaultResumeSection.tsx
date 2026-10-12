// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Link } from 'react-router'
import { FileText, FileUp, Plus } from 'lucide-react'
import { Field } from '../../components/Field'
import { api } from '../../lib/api'
import { ListDocuments, type settings } from '../../lib/backend'
import { withReturn } from '../../lib/needsResume'
import { settingsLink } from '../../lib/settingsNav'
import { useLoad } from '../../lib/useLoad'
import { Section } from './Section'

const SETTINGS_PROFILE = settingsLink('profile')

type Props = { s: settings.Settings; setS: (s: settings.Settings) => void }

/** Which resume from Resumes the AI features read, and the way to make or import one. */
export function DefaultResumeSection({ s, setS }: Props) {
  const { data: resumes } = useLoad(() => api(ListDocuments('resume', false)), [])
  const chosen = resumes?.find((r) => r.id === s.defaultResumeId)

  return (
    <Section title="Default resume" hint="Match scores, mock interviews, scorecards and question plans read this resume. Build and edit resumes on the Resumes page.">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field label="Resume">
            <select className="field" value={chosen ? chosen.id : ''} onChange={(e) => setS({ ...s, defaultResumeId: e.target.value })}>
              <option value="">None</option>
              {resumes?.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {chosen && (
          <Link to={`/resumes/${chosen.id}`} className="btn btn-ghost">
            <FileText size={15} /> Open in the builder
          </Link>
        )}
        <Link to={withReturn('/resumes?new=resume', SETTINGS_PROFILE)} className="btn btn-ghost">
          <Plus size={15} /> Create
        </Link>
        <Link to={withReturn('/resumes?import=1', SETTINGS_PROFILE)} className="btn btn-ghost">
          <FileUp size={15} /> Import
        </Link>
      </div>
    </Section>
  )
}
