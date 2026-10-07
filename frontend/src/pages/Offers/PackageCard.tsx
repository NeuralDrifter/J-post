import { Copy, Eye, EyeOff, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { labelFor, lookup } from '../../lib/format'
import { openMenu } from '../../lib/menu'
import { Chip } from '../../components/Chip'
import { IconButton } from '../../components/IconButton'
import { SourceMark } from '../../components/SourceMark'
import type { main } from '../../lib/backend'
import { formatDelta, formatMoneyFull, KIND_LABEL, KIND_TONE, percentileLabel } from '../../lib/comp'
import { baselineDetail, colDetail, marketDetail, taxDetail } from '../../lib/sources'

type Props = {
  item: main.ComparisonItem
  sources?: main.DataSources
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onCounter: () => void
  onDelete: () => void
}

export function PackageCard({ item, sources, selected, onToggle, onEdit, onCounter, onDelete }: Props) {
  const { package: p, result: r } = item
  const delta = r.deltaVsCurrent

  return (
    <article
      onContextMenu={(e) =>
        openMenu(e, [
          { label: 'Edit', icon: Pencil, onSelect: onEdit },
          ...(p.kind === 'offer' || p.kind === 'estimate' ? [{ label: 'Draft counter-offer', icon: Copy, onSelect: onCounter }] : []),
          { label: selected ? 'Exclude from comparison' : 'Include in comparison', icon: selected ? EyeOff : Eye, onSelect: onToggle },
          'separator',
          { label: 'Delete', icon: Trash2, danger: true, onSelect: onDelete },
        ])
      }
      className={`glass flex w-72 shrink-0 flex-col rounded-2xl p-4 transition ${selected ? 'border-accent/50 shadow-lg shadow-accent/10' : 'opacity-70'}`}
    >
      <header className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 accent-indigo-500"
          checked={selected}
          onChange={onToggle}
          aria-label={`Compare ${item.company} ${p.label}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-ink-2">{item.company}</p>
          <h3 className="truncate text-sm font-semibold" title={p.label}>
            {p.label || labelFor(KIND_LABEL, p.kind)}
          </h3>
          {item.position && <p className="truncate text-xs text-ink-3">{item.position}</p>}
        </div>
        <Chip tone={lookup(KIND_TONE, p.kind, 'neutral')}>{labelFor(KIND_LABEL, p.kind)}</Chip>
      </header>

      <div className="mt-4">
        <p className="label-mono">Year-1 total</p>
        <p className="font-mono text-2xl font-bold tracking-tight">{formatMoneyFull(r.year1Total)}</p>
        {delta ? (
          <p className={`font-mono text-xs ${delta.year1Total >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatDelta(delta.year1Total)} vs current
          </p>
        ) : r.marketBaseline ? (
          <p className={`font-mono text-xs ${r.marketBaseline.baseDelta >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatDelta(r.marketBaseline.baseDelta)} base vs typical
            <SourceMark source="bls" detail={baselineDetail(r.marketBaseline, sources)} />
          </p>
        ) : p.kind !== 'current' ? (
          <p className="text-[11px] text-ink-3">Set your occupation in Settings to compare with typical pay.</p>
        ) : null}
      </div>

      <dl className="mt-3 space-y-1.5 border-t border-line pt-3 font-mono text-xs">
        <Row label="4-yr average" value={formatMoneyFull(r.avgPerYear)} />
        <Row
          label="Yr-1 take-home"
          value={
            <>
              {formatMoneyFull(r.year1TakeHome)}
              <SourceMark source="tax" detail={taxDetail(r.tax1)} />
            </>
          }
        />
        <Row
          label="Market (base)"
          value={
            r.market ? (
              <>
                {percentileLabel(r.market)} pct
                <SourceMark source="bls" detail={marketDetail(r.market, sources)} />
              </>
            ) : (
              <span className="text-ink-3">set occupation</span>
            )
          }
        />
        <Row
          label="Home dollars"
          value={
            <>
              {formatMoneyFull(r.year1ColAdjusted)}
              <SourceMark source="bea" detail={colDetail(r, sources)} />
            </>
          }
        />
      </dl>

      {r.warnings.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-amber-300" title={r.warnings.join('\n')}>
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{r.warnings[0]}</span>
        </p>
      )}

      <footer className="mt-auto flex justify-end gap-0.5 pt-3">
        {(p.kind === 'offer' || p.kind === 'estimate') && (
          <IconButton label="Draft a counter-offer" onClick={onCounter}>
            <Copy size={14} />
          </IconButton>
        )}
        <IconButton label="Edit" onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
        <IconButton label="Delete" onClick={onDelete}>
          <Trash2 size={14} />
        </IconButton>
      </footer>
    </article>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}
