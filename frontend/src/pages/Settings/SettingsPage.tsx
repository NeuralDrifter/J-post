import { useState, type FormEvent } from 'react'
import { ExternalLink, FolderOpen, LoaderCircle } from 'lucide-react'
import { CodePicker } from '../../components/comp/CodePicker'
import { PackageEditor } from '../../components/comp/PackageEditor'
import { Field } from '../../components/JobForm'
import { PageTitle } from '../../components/PageTitle'
import { api, apiOk } from '../../lib/api'
import {
  BrowserOpenURL,
  DataDir,
  DescribeArea,
  DescribeOccupation,
  GetCurrentComp,
  GetProfile,
  UpdateResumeText,
  UploadResume,
  GetSettings,
  OpenDataDir,
  SaveSettings,
  SearchAreas,
  SearchOccupations,
  TestPython,
  type main,
} from '../../lib/backend'
import { blankPackage, FILING_LABEL, formatMoneyFull } from '../../lib/comp'
import { notifyDataChanged } from '../../lib/events'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { AIProvidersSection } from './AIProvidersSection'
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

export default function SettingsPage() {
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const { data: dataDir } = useLoad(() => api(DataDir()), [])
  return (
    <div className="max-w-3xl space-y-4">
      <PageTitle title="Settings" subtitle="Stored only on this computer." />
      {settings ? <SettingsForm initial={settings} dataDir={dataDir ?? ''} /> : <p className="text-sm text-ink-2">Loading…</p>}
    </div>
  )
}

function ResumeSection() {
  const { data: profile } = useLoad(() => api(GetProfile()), [])
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const value = text ?? profile?.resumeText ?? ''

  const upload = async () => {
    setBusy(true)
    const p = await api(UploadResume())
    setBusy(false)
    if (!p) return
    setText(null)
    notifyDataChanged()
    toast.success(`Read ${p.resumeFileName}. Check the text below.`)
  }

  const save = async () => {
    if (await apiOk(UpdateResumeText(value))) {
      setText(null)
      notifyDataChanged()
      toast.success('Resume text saved')
    }
  }

  return (
    <Section title="Resume" hint="Used by every AI feature. Review the extracted text and fix anything that came out wrong.">
      <div className="mb-3 flex items-center gap-3">
        <button type="button" className="btn btn-ghost" onClick={upload} disabled={busy}>
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : null} {profile?.resumeFileName ? 'Replace resume' : 'Upload resume'}
        </button>
        <span className="font-mono text-xs text-ink-3">{profile?.resumeFileName || 'PDF, DOCX, TXT or Markdown'}</span>
      </div>
      <textarea className="field min-h-48 font-mono text-[12px] leading-relaxed" value={value} onChange={(e) => setText(e.target.value)} placeholder="Your resume text appears here after upload. You can also paste it." />
      {text !== null && text !== profile?.resumeText && (
        <div className="mt-2 flex justify-end">
          <button type="button" className="btn btn-primary py-1.5 text-xs" onClick={save}>
            Save resume text
          </button>
        </div>
      )}
    </Section>
  )
}

function SettingsForm({ initial, dataDir }: { initial: main.Settings; dataDir: string }) {
  const [s, setS] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [editingCurrent, setEditingCurrent] = useState<main.CompPackage | null>(null)
  const { data: current } = useLoad(() => api(GetCurrentComp()), [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const ok = await apiOk(
      SaveSettings({ ...s, followUpDays: Math.round(Number(s.followUpDays)) || 7, discoverCacheHours: Math.round(Number(s.discoverCacheHours)) || 12 }),
    )
    setSaving(false)
    if (!ok) return
    toast.success('Settings saved')
    notifyDataChanged()
  }

  const test = async () => {
    setTesting(true)
    const path = await api(TestPython(s.pythonPath))
    setTesting(false)
    if (path) toast.success(`JobSpy is ready (${path})`)
  }

  return (
    <>
    <form onSubmit={save} className="space-y-4">
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

      <Section title="Pipeline" hint="Applied jobs with no movement for longer than this are flagged for a follow-up.">
        <div className="flex items-center gap-2 text-sm">
          <input
            className="field w-24"
            type="number"
            min={1}
            max={365}
            value={s.followUpDays}
            onChange={(e) => setS({ ...s, followUpDays: Number(e.target.value) })}
          />
          <span className="text-ink-2">days</span>
        </div>
      </Section>

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
            <p className="text-sm font-semibold">Current job baseline <span className="font-normal text-ink-3">(optional)</span></p>
            <p className="font-mono text-xs text-ink-3">
              {current ? `${formatMoneyFull(current.baseSalary)} base · every offer shows the difference` : 'Skip this if you’re between jobs. Offers are still compared with each other.'}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setEditingCurrent(current ?? blankPackage('current'))}>
            {current ? 'Edit' : 'Set up'}
          </button>
        </div>
      </Section>

      <AIProvidersSection s={s} setS={setS} />

      <ResumeSection />

      <Section title="Data" hint="Your database, settings and attached files live here. Back this folder up to keep your history.">
        <div className="flex items-center gap-2">
          <code className="field flex-1 truncate font-mono text-xs text-ink-2">{dataDir}</code>
          <button type="button" className="btn btn-ghost" onClick={() => apiOk(OpenDataDir())}>
            <FolderOpen size={15} /> Open
          </button>
        </div>
      </Section>

      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={saving}>
          Save settings
        </button>
      </div>
    </form>
    {/* Outside the settings form: the editor is a form of its own. */}
    {editingCurrent && <PackageEditor initial={editingCurrent} onClose={() => setEditingCurrent(null)} />}
    </>
  )
}
