// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CircleCheck, CircleDot, FolderOpen, LoaderCircle, Scale } from 'lucide-react'
import { PackageEditor } from '../../components/comp/PackageEditor'
import { PageTitle } from '../../components/PageTitle'
import { api, apiOk } from '../../lib/api'
import { DataDir, GetCurrentComp, GetSettings, OpenDataDir, SaveSettings, type comp, type settings } from '../../lib/backend'
import { blankPackage } from '../../lib/comp'
import { notifyDataChanged } from '../../lib/events'
import { readSessionValue, writeSessionValue } from '../../lib/prefs'
import { hasUnsavedChanges, SETTINGS_SECTIONS, sectionFromParam, type SettingsSectionId } from '../../lib/settingsNav'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { AIFeaturesSection } from './AIFeaturesSection'
import { AIProvidersSection } from './AIProvidersSection'
import { CompensationSection } from './CompensationSection'
import { DefaultResumeSection } from './DefaultResumeSection'
import { JobMatchingSection } from './JobMatchingSection'
import { JobSearchSection } from './JobSearchSection'
import { Section } from './Section'

// Unsaved edits are kept here, so leaving Settings and coming back loses nothing.
const DRAFT_KEY = 'settingsDraft'

export default function SettingsPage() {
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const { data: dataDir } = useLoad(() => api(DataDir()), [])
  return (
    <div className="max-w-5xl space-y-4">
      <PageTitle title="Settings" subtitle="Stored only on this computer." />
      {settings ? <SettingsForm initial={settings} dataDir={dataDir ?? ''} /> : <p className="text-sm text-ink-2">Loading…</p>}
    </div>
  )
}

function SettingsForm({ initial, dataDir }: { initial: settings.Settings; dataDir: string }) {
  const [params, setParams] = useSearchParams()
  const section = sectionFromParam(params.get('section'))
  const [saved, setSaved] = useState(initial)
  const [s, setDraft] = useState<settings.Settings>(() => readSessionValue<settings.Settings>(DRAFT_KEY) ?? initial)
  const [saving, setSaving] = useState(false)
  const [editingCurrent, setEditingCurrent] = useState<comp.CompPackage | null>(null)
  const { data: current } = useLoad(() => api(GetCurrentComp()), [])
  const dirty = hasUnsavedChanges(saved, s)

  const setS = (next: settings.Settings) => {
    setDraft(next)
    writeSessionValue(DRAFT_KEY, next)
  }

  const save = async (e?: SubmitEvent) => {
    e?.preventDefault()
    // A blank or invalid number goes as 0, which the backend replaces with its default.
    const wholeOrZero = (n: number) => Math.round(Number(n)) || 0
    const next = {
      ...s,
      followUpDays: wholeOrZero(s.followUpDays),
      discoverCacheHours: wholeOrZero(s.discoverCacheHours),
      matchPerRequest: wholeOrZero(s.matchPerRequest),
    }
    setSaving(true)
    const stored = await api(SaveSettings(next))
    setSaving(false)
    if (!stored) return
    setSaved(stored)
    setDraft(stored)
    writeSessionValue(DRAFT_KEY, null)
    toast.success('Settings saved')
    notifyDataChanged()
  }

  const discard = () => {
    setDraft(saved)
    writeSessionValue(DRAFT_KEY, null)
  }

  const show = (id: SettingsSectionId) => setParams({ section: id })

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[13rem_minmax(0,1fr)]">
      <nav className="flex flex-wrap gap-1 self-start min-[900px]:sticky min-[900px]:top-0 min-[900px]:flex-col" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => show(item.id)}
            aria-current={section === item.id ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-left text-sm transition ${
              section === item.id ? 'bg-accent/25 font-semibold text-ink' : 'text-ink-2 hover:bg-white/5 hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <form onSubmit={save} className="min-w-0 space-y-4">
        {section === 'profile' && (
          <>
            <DefaultResumeSection s={s} setS={setS} />
          </>
        )}
        {section === 'ai' && <AIProvidersSection s={s} setS={setS} />}
        {section === 'features' && <AIFeaturesSection s={s} setS={setS} />}
        {section === 'matching' && <JobMatchingSection s={s} setS={setS} />}
        {section === 'search' && <JobSearchSection s={s} setS={setS} />}
        {section === 'pipeline' && (
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
        )}
        {section === 'compensation' && (
          <CompensationSection s={s} setS={setS} current={current} onEditCurrent={() => setEditingCurrent(current ?? blankPackage('current'))} />
        )}
        {section === 'data' && (
          <>
            <Section title="Data" hint="Your database, settings and attached files live here. Back this folder up to keep your history.">
              <div className="flex items-center gap-2">
                <code className="field flex-1 truncate font-mono text-xs text-ink-2">{dataDir}</code>
                <button type="button" className="btn btn-ghost" onClick={() => apiOk(OpenDataDir())}>
                  <FolderOpen size={15} /> Open
                </button>
              </div>
            </Section>
            <Section title="About" hint="J-POST is built on open-source libraries and public data. Their licenses and credits are listed here.">
              <p className="mb-3 text-xs text-ink-2">Built with assistance from Claude Opus 5.5 (Anthropic) and Gemini 3.1 Pro (Google). Visual design ideas from Google Stitch.</p>
              <Link to="/licenses" className="btn btn-ghost w-fit">
                <Scale size={15} /> Open-source licenses
              </Link>
            </Section>
          </>
        )}

        {/* One Save for every section; it stays in view while you scroll. */}
        <div
          className={`sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur ${
            dirty ? 'border-warn/50 bg-raised/95' : 'border-line bg-raised/80'
          }`}
        >
          <span className={`flex items-center gap-2 text-sm ${dirty ? 'text-amber-300' : 'text-ink-3'}`}>
            {dirty ? <CircleDot size={15} /> : <CircleCheck size={15} />}
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <span className="flex gap-2">
            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={discard} disabled={saving}>
                Discard
              </button>
            )}
            <button className="btn btn-primary" disabled={!dirty || saving}>
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : null} Save settings
            </button>
          </span>
        </div>
      </form>

      {/* Outside the settings form: the editor is a form of its own. */}
      {editingCurrent && <PackageEditor initial={editingCurrent} onClose={() => setEditingCurrent(null)} />}
    </div>
  )
}
