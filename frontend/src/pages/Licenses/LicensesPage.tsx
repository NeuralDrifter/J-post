// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { PageTitle } from '../../components/PageTitle'
import { Panel } from '../../components/Panel'
import { BrowserOpenURL } from '../../lib/backend'
import licenses from '../../generated/licenses.json'
import { BUILT_WITH, DATA, SERVICES, THANKS, type Credit } from './credits'
import { filterLicenses, type LicenseEntry } from './filter'

const GROUPS = { vendored: 'Included source', npm: 'App interface', go: 'App core' } as const
type Group = keyof typeof GROUPS

/** Everything Job Track is built on or draws from, with each license's full text. */
export default function LicensesPage() {
  const [group, setGroup] = useState<Group>('vendored')
  const [query, setQuery] = useState('')
  const shown = filterLicenses(licenses[group] as LicenseEntry[], query)

  return (
    <div className="space-y-4">
      <Link to="/settings" className="flex w-fit items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={13} /> Settings
      </Link>
      <PageTitle title="Open-source licenses" subtitle="The libraries, data and services Job Track is built on, and the projects that shaped it." />

      <Panel title="Job Track" action={<OpenLink url={licenses.app.url} />}>
        <p className="mb-2 text-xs text-ink-2">
          Job Track is open source under the {licenses.app.license} license. Third-party source code, libraries, fonts and data below keep their own licenses.
        </p>
        <pre className="max-h-80 overflow-auto rounded-xl bg-black/30 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-2">{licenses.app.text}</pre>
      </Panel>

      <CreditPanel title="Built with" credits={BUILT_WITH} />

      <Panel
        title="Libraries"
        action={
          <div className="flex gap-1">
            {(Object.keys(GROUPS) as Group[]).map((g) => (
              <button key={g} type="button" className={`btn py-1 text-xs ${g === group ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setGroup(g)}>
                {GROUPS[g]} ({licenses[g].length})
              </button>
            ))}
          </div>
        }
      >
        <input className="field mb-3" placeholder="Search by name or license" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search licenses" />
        {shown.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-3">No matches</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((e) => (
              <LibraryRow key={`${e.name}@${e.version}`} entry={e} />
            ))}
          </ul>
        )}
      </Panel>

      <CreditPanel title="Data" credits={DATA} />
      <CreditPanel title="Services" credits={SERVICES} />
      <CreditPanel title="Thanks" credits={THANKS} />
    </div>
  )
}

/** One library; its license text is only rendered once opened, so the list stays fast. */
function LibraryRow({ entry }: { entry: LicenseEntry }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronRight size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="truncate font-mono text-xs">{entry.name}</span>
          <span className="shrink-0 text-[11px] text-ink-3">{entry.version}</span>
        </button>
        <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{entry.license}</span>
        <OpenLink url={entry.url} />
      </div>
      {open && (
        <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-black/30 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {entry.text || `This package ships no license file; its package.json declares ${entry.license}.`}
        </pre>
      )}
    </li>
  )
}

function CreditPanel({ title, credits }: { title: string; credits: Credit[] }) {
  return (
    <Panel title={title}>
      <ul className="divide-y divide-line">
        {credits.map((c) => (
          <li key={c.name} className="flex items-start gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{c.name}</p>
              <p className="text-[11px] text-ink-3">{c.detail}</p>
            </div>
            {c.license && <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{c.license}</span>}
            <OpenLink url={c.url} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function OpenLink({ url }: { url: string }) {
  if (!url) return null
  return (
    <button type="button" className="shrink-0 text-ink-3 hover:text-indigo-300" onClick={() => BrowserOpenURL(url)} title={url} aria-label={`Open ${url}`}>
      <ExternalLink size={13} />
    </button>
  )
}
