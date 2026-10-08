// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Scale } from 'lucide-react'
import { confirmDialog } from '../../components/ConfirmDialog'
import { PackageEditor } from '../../components/comp/PackageEditor'
import { PageTitle } from '../../components/PageTitle'
import { SourcesFooter } from '../../components/SourcesFooter'
import { api, apiOk } from '../../lib/api'
import { DeleteCompPackage, DraftCounter, ListComparisons, type main } from '../../lib/backend'
import { blankPackage } from '../../lib/comp'
import { notifyDataChanged } from '../../lib/events'
import { readPref, writePref } from '../../lib/prefs'
import { useSources } from '../../lib/sources'
import { useLoad } from '../../lib/useLoad'
import { BreakdownTable } from './BreakdownTable'
import { CompChart } from './CompChart'
import { MarketStrips, ScenariosTable } from './MarketAndScenarios'
import { PackageCard } from './PackageCard'

function readHidden(): Set<string> {
  try {
    return new Set(JSON.parse(readPref('offersHidden', '[]')) as string[])
  } catch {
    return new Set()
  }
}

export default function OffersPage() {
  const navigate = useNavigate()
  const { data: items, loading } = useLoad(() => api(ListComparisons()), [])
  const sources = useSources()
  // Remember what's deselected, so new packages show up selected by default.
  const [hidden, setHidden] = useState(readHidden)
  const [editing, setEditing] = useState<main.CompPackage | null>(null)

  const selected = useMemo(() => (items ?? []).filter((it) => !hidden.has(it.package.id)), [items, hidden])

  const toggle = (id: string) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHidden(next)
    writePref('offersHidden', JSON.stringify([...next]))
  }

  const counter = async (id: string) => {
    const c = await api(DraftCounter(id))
    if (!c) return
    notifyDataChanged()
    setEditing(c)
  }

  const remove = async (it: main.ComparisonItem) => {
    const ok = await confirmDialog({
      title: 'Delete this package?',
      message: `Delete "${it.package.label}" for ${it.company}?`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok && (await apiOk(DeleteCompPackage(it.package.id)))) notifyDataChanged()
  }

  const hasCurrent = items?.some((it) => it.package.kind === 'current')

  return (
    <div className="space-y-4">
      <PageTitle title="Offers" subtitle="Total comp, take-home, market position and cost of living, side by side.">
        {items && !hasCurrent && (
          <button className="btn btn-ghost" onClick={() => setEditing(blankPackage('current'))}>
            Add current job (optional)
          </button>
        )}
      </PageTitle>

      {!items ? (
        <p className="text-sm text-ink-2">{loading ? 'Loading…' : ''}</p>
      ) : items.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-line p-8 text-center">
          <div>
            <Scale size={28} className="mx-auto mb-3 text-ink-3" />
            <p className="text-sm text-ink-2">Add an estimate or offer from a job's page (Compensation panel) to start comparing.</p>
            <button className="btn btn-ghost mt-4" onClick={() => navigate('/')}>
              Go to pipeline
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {items.map((it) => (
              <PackageCard
                key={it.package.id}
                item={it}
                sources={sources}
                selected={!hidden.has(it.package.id)}
                onToggle={() => toggle(it.package.id)}
                onEdit={() => setEditing(it.package)}
                onCounter={() => counter(it.package.id)}
                onDelete={() => remove(it)}
              />
            ))}
          </div>
          {selected.length > 0 ? (
            <>
              <CompChart items={selected} />
              <BreakdownTable items={selected} sources={sources} />
              <MarketStrips items={selected} sources={sources} />
              <ScenariosTable items={selected} />
            </>
          ) : (
            <p className="text-sm text-ink-3">Tick at least one card to compare.</p>
          )}
          <SourcesFooter />
        </>
      )}
      {editing && <PackageEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
