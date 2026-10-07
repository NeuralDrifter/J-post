import { useState } from 'react'
import { labelFor, lookup } from '../../lib/format'
import { useNavigate } from 'react-router'
import { ArrowRight, Copy, Pencil, Trash2 } from 'lucide-react'
import { confirmDialog } from '../../components/ConfirmDialog'
import { openMenu } from '../../lib/menu'
import { notifyDataChanged } from '../../lib/events'
import { Chip } from '../../components/Chip'
import { PackageEditor } from '../../components/comp/PackageEditor'
import { Panel } from '../../components/Panel'
import { SourceMark } from '../../components/SourceMark'
import { api, apiOk } from '../../lib/api'
import { DeleteCompPackage, DraftCounter, ListCompForJob, NewEstimate, type main } from '../../lib/backend'
import { formatMoneyFull, KIND_LABEL, KIND_TONE } from '../../lib/comp'
import { taxDetail } from '../../lib/sources'
import { useLoad } from '../../lib/useLoad'

export function CompPanel({ jobId }: { jobId: string }) {
  const navigate = useNavigate()
  const { data: items } = useLoad(() => api(ListCompForJob(jobId)), [jobId])
  const [editing, setEditing] = useState<main.CompPackage | null>(null)

  // Both start from the job's posted range and location; an offer just changes the kind.
  const start = async (kind: 'offer' | 'estimate') => {
    const draft = await api(NewEstimate(jobId))
    if (draft) setEditing({ ...draft, kind, label: kind === 'offer' ? 'Offer' : 'Estimate' })
  }

  const counter = async (id: string) => {
    const c = await api(DraftCounter(id))
    if (!c) return
    notifyDataChanged()
    setEditing(c)
  }

  const remove = async (it: main.ComparisonItem) => {
    const ok = await confirmDialog({ title: 'Delete this package?', message: `Delete "${it.package.label}"?`, confirmLabel: 'Delete', danger: true })
    if (ok && (await apiOk(DeleteCompPackage(it.package.id)))) notifyDataChanged()
  }

  return (
    <Panel
      title="Compensation"
      action={
        items && items.length > 0 ? (
          <button className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink" onClick={() => navigate('/offers')}>
            Compare <ArrowRight size={12} />
          </button>
        ) : undefined
      }
    >
      {items?.length ? (
        <ul className="mb-3 space-y-2">
          {items.map((it) => (
            <li
              key={it.package.id}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Edit', icon: Pencil, onSelect: () => setEditing(it.package) },
                  ...(it.package.kind === 'offer' || it.package.kind === 'estimate'
                    ? [{ label: 'Draft counter-offer', icon: Copy, onSelect: () => counter(it.package.id) }]
                    : []),
                  'separator',
                  { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(it) },
                ])
              }
            >
              <button
                className="w-full rounded-xl border border-line bg-white/[0.03] p-3 text-left transition hover:border-line-strong"
                onClick={() => setEditing(it.package)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{it.package.label || labelFor(KIND_LABEL, it.package.kind)}</span>
                  <Chip tone={lookup(KIND_TONE, it.package.kind, 'neutral')}>{labelFor(KIND_LABEL, it.package.kind)}</Chip>
                </div>
                <p className="mt-1 font-mono text-xs text-ink-2">
                  {formatMoneyFull(it.result.year1Total)} yr-1 · {formatMoneyFull(it.result.year1TakeHome)} take-home
                  <SourceMark source="tax" detail={taxDetail(it.result.tax1)} />
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-ink-3">Model what this job pays: an expected range now, the real offer later.</p>
      )}
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1 py-1.5 text-xs" onClick={() => start('estimate')}>
          Add estimate
        </button>
        <button className="btn btn-ghost flex-1 py-1.5 text-xs" onClick={() => start('offer')}>
          Add offer
        </button>
      </div>
      {editing && <PackageEditor initial={editing} onClose={() => setEditing(null)} />}
    </Panel>
  )
}
