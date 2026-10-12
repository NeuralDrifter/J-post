// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { GitCompare } from 'lucide-react'
import { api } from '../../../lib/api'
import { GetDocumentVersion, type app } from '../../../lib/backend'
import { changedBlocks, type ChangedBlock } from '../../../lib/resumes/ai/textDiff'
import { DiffText } from '../ai/DiffText'
import type { PreviewedVersion } from './HistoryPanel'

type Comparison = { label: string; blocks: ChangedBlock[] }

/** Show changes: what a version changed from the one before it, or how it differs from now, word by word. */
export function VersionChanges({ previewed, older, nowText }: { previewed: PreviewedVersion; older?: app.DocumentVersion; nowText: () => string }) {
  const [comparison, setComparison] = useState<Comparison | null>(null)

  const sinceOlder = async () => {
    const full = older && (await api(GetDocumentVersion(older.id)))
    if (full) setComparison({ label: 'Changed in this version', blocks: changedBlocks(full.plainText, previewed.plainText) })
  }
  const withNow = () => setComparison({ label: 'From this version to now', blocks: changedBlocks(previewed.plainText, nowText()) })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {older && (
          <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => void sinceOlder()}>
            <GitCompare size={13} /> Show changes
          </button>
        )}
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={withNow}>
          <GitCompare size={13} /> Compare with now
        </button>
      </div>
      {comparison && <ComparisonList comparison={comparison} />}
    </div>
  )
}

function ComparisonList({ comparison }: { comparison: Comparison }) {
  if (comparison.blocks.length === 0) return <p className="text-xs text-ink-2">No changes to the text.</p>
  return (
    <div className="space-y-1.5">
      <p className="label-mono">{comparison.label}</p>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto">
        {comparison.blocks.map((block, i) => (
          <li key={i} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
            <DiffText before={block.before} after={block.after} />
          </li>
        ))}
      </ul>
    </div>
  )
}
