// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { Field } from '../../components/Field'
import { api } from '../../lib/api'
import { BrowserOpenURL, TestPython, type settings } from '../../lib/backend'
import { toast } from '../../lib/toast'
import { Section } from './Section'

// Category names exactly as The Muse's API documents them.
const MUSE_CATEGORIES = [
  'Accounting and Finance', 'Account Management/Customer Success', 'Administration and Office', 'Advertising and Marketing',
  'Business Operations', 'Computer and IT', 'Customer Service', 'Data and Analytics', 'Data Science', 'Design and UX',
  'Education', 'Healthcare', 'Human Resources and Recruitment', 'IT', 'Legal Services', 'Management',
  'Manufacturing and Warehouse', 'Marketing', 'Media PR and Communications', 'Product Management', 'Project Management',
  'Real Estate', 'Retail', 'Sales', 'Science and Engineering', 'Software Engineering', 'Transportation and Logistics',
  'Writing and Editing',
]

type Props = { s: settings.Settings; setS: (s: settings.Settings) => void }

/** Where Discover searches: board keys, The Muse categories, result reuse, and Python for JobSpy. */
export function JobSearchSection({ s, setS }: Props) {
  const [testing, setTesting] = useState(false)

  const test = async () => {
    setTesting(true)
    const path = await api(TestPython(s.pythonPath))
    setTesting(false)
    if (path) toast.success(`JobSpy is ready (${path})`)
  }

  return (
    <>
      <Section title="Job sources" hint="Himalayas, Jobicy and the JobSpy boards need no setup. Adzuna and USAJobs need free keys; The Muse needs categories.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Adzuna App ID">
            <input className="field" type="password" autoComplete="off" value={s.adzunaAppId} onChange={(e) => setS({ ...s, adzunaAppId: e.target.value })} />
          </Field>
          <Field label="Adzuna App Key">
            <input className="field" type="password" autoComplete="off" value={s.adzunaAppKey} onChange={(e) => setS({ ...s, adzunaAppKey: e.target.value })} />
          </Field>
        </div>
        <button type="button" className="mt-3 flex items-center gap-1 text-xs text-indigo-300 hover:underline" onClick={() => BrowserOpenURL('https://developer.adzuna.com/')}>
          <ExternalLink size={12} /> Get Adzuna keys
        </button>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="USAJobs API key">
            <input className="field" type="password" autoComplete="off" value={s.usajobsKey} onChange={(e) => setS({ ...s, usajobsKey: e.target.value })} />
          </Field>
          <Field label="Email you registered with USAJobs">
            <input className="field" type="email" value={s.usajobsEmail} onChange={(e) => setS({ ...s, usajobsEmail: e.target.value })} />
          </Field>
        </div>
        <button
          type="button"
          className="mt-3 flex items-center gap-1 text-xs text-indigo-300 hover:underline"
          onClick={() => BrowserOpenURL('https://developer.usajobs.gov/apirequest/')}
        >
          <ExternalLink size={12} /> Request a free USAJobs key (federal jobs)
        </button>
        <div className="mt-5">
          <p className="label-mono mb-2">The Muse categories (copied locally, refreshed daily)</p>
          <div className="grid max-h-40 grid-cols-3 gap-x-4 gap-y-1 overflow-y-auto rounded-xl border border-line p-3 text-xs text-ink-2">
            {MUSE_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={s.museCategories.includes(c)}
                  onChange={() =>
                    setS({ ...s, museCategories: s.museCategories.includes(c) ? s.museCategories.filter((x) => x !== c) : [...s.museCategories, c] })
                  }
                />
                {c}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-3">Each category × search location is a separate copy (about a minute to download the first time).</p>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-ink-2">Re-use search results for</span>
          <input
            className="field w-20"
            type="number"
            min={1}
            max={168}
            value={s.discoverCacheHours}
            onChange={(e) => setS({ ...s, discoverCacheHours: Number(e.target.value) })}
          />
          <span className="text-ink-2">hours before scraping again</span>
        </div>
      </Section>

      <Section title="Python for JobSpy" hint="Leave blank to auto-detect the venv folder next to the app or the project.">
        <div className="flex gap-2">
          <input
            className="field font-mono text-xs"
            value={s.pythonPath}
            onChange={(e) => setS({ ...s, pythonPath: e.target.value })}
            placeholder="C:\path\to\venv\Scripts\python.exe"
          />
          <button type="button" className="btn btn-ghost min-w-24" onClick={test} disabled={testing}>
            {testing ? <LoaderCircle size={15} className="animate-spin" /> : 'Test'}
          </button>
        </div>
      </Section>
    </>
  )
}
