import { useState, type FormEvent, type ReactNode } from 'react'
import { ExternalLink, FolderOpen, LoaderCircle } from 'lucide-react'
import { Field } from '../../components/JobForm'
import { PageTitle } from '../../components/PageTitle'
import { api, apiOk } from '../../lib/api'
import { BrowserOpenURL, DataDir, GetSettings, OpenDataDir, SaveSettings, TestPython, type main } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

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

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-ink-3">{hint}</p>
      {children}
    </section>
  )
}

function SettingsForm({ initial, dataDir }: { initial: main.Settings; dataDir: string }) {
  const [s, setS] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const ok = await apiOk(SaveSettings({ ...s, followUpDays: Math.round(Number(s.followUpDays)) || 7 }))
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
    <form onSubmit={save} className="space-y-4">
      <Section title="Job sources" hint="Indeed, LinkedIn and ZipRecruiter need no keys. Adzuna needs a free API key.">
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
  )
}
