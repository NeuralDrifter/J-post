import { SourceMark } from '../../components/SourceMark'
import type { main } from '../../lib/backend'
import { formatDelta, formatMoneyFull, percentileLabel } from '../../lib/comp'
import { formatMoney } from '../../lib/format'
import { baselineDetail, colDetail, marketDetail, taxDetail } from '../../lib/sources'

type Row = { label: string; value: (r: main.PackageResult) => number; sub?: boolean; tax?: boolean; strong?: boolean }

const ROWS: Row[] = [
  { label: 'Base salary', value: (r) => r.years[0].base },
  { label: 'Bonus (target)', value: (r) => r.years[0].bonus },
  { label: 'Signing bonus', value: (r) => r.years[0].signing },
  { label: 'Equity vesting', value: (r) => r.years[0].equity },
  { label: 'Benefits (net)', value: (r) => r.years[0].benefits },
  { label: 'Year-1 total', value: (r) => r.year1Total, strong: true },
  { label: 'Federal income tax', value: (r) => -r.tax1.federal, sub: true, tax: true },
  { label: 'Social Security', value: (r) => -r.tax1.socialSecurity, sub: true, tax: true },
  { label: 'Medicare', value: (r) => -r.tax1.medicare, sub: true, tax: true },
  { label: 'State income tax', value: (r) => -r.tax1.state, sub: true, tax: true },
  { label: 'Local tax', value: (r) => -r.tax1.local, sub: true, tax: true },
  { label: 'Year-1 take-home', value: (r) => r.year1TakeHome, strong: true, tax: true },
  { label: '4-year total', value: (r) => r.fourYearTotal, strong: true },
  { label: 'PTO value (info)', value: (r) => r.ptoValue, sub: true },
]

export function BreakdownTable({ items, sources }: { items: main.ComparisonItem[]; sources?: main.DataSources }) {
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-raised/60">
          <tr>
            <th className="label-mono px-4 py-2.5 text-left font-normal">Year 1</th>
            {items.map((it) => (
              <th key={it.package.id} className="px-4 py-2.5 text-right text-xs font-semibold">
                <span className="block truncate">{it.company}</span>
                <span className="block truncate font-normal text-ink-3">{it.package.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-xs">
          {ROWS.map((row) => (
            <tr key={row.label} className={`border-t border-line ${row.strong ? 'bg-white/[0.03]' : ''}`}>
              <td className={`px-4 py-2 font-sans ${row.sub ? 'pl-8 text-ink-3' : row.strong ? 'font-semibold' : 'text-ink-2'}`}>{row.label}</td>
              {items.map((it) => {
                const v = row.value(it.result)
                return (
                  <td key={it.package.id} className={`px-4 py-2 text-right ${row.strong ? 'font-bold' : ''} ${v < 0 ? 'text-rose-300/80' : ''}`}>
                    {v === 0 && row.sub ? '—' : formatMoneyFull(v).replace('$-', '−$')}
                    {row.tax && v !== 0 && <SourceMark source="tax" detail={taxDetail(it.result.tax1)} />}
                  </td>
                )
              })}
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="px-4 py-2 font-sans text-ink-2">Market position (base)</td>
            {items.map((it) => {
              const m = it.result.market
              return (
                <td key={it.package.id} className="px-4 py-2 text-right">
                  {m ? (
                    <>
                      {percentileLabel(m)} pct
                      <SourceMark source="bls" detail={marketDetail(m, sources)} />
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              )
            })}
          </tr>
          {items.some((it) => it.result.marketBaseline) && (
            <tr className="border-t border-line">
              <td className="px-4 py-2 font-sans text-ink-2">Base vs typical (BLS median)</td>
              {items.map((it) => {
                const b = it.result.marketBaseline
                return (
                  <td key={it.package.id} className={`px-4 py-2 text-right ${b ? (b.baseDelta >= 0 ? 'text-success' : 'text-rose-300') : ''}`}>
                    {b ? (
                      <>
                        {formatDelta(b.baseDelta)}
                        <SourceMark source="bls" detail={baselineDetail(b, sources)} />
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                )
              })}
            </tr>
          )}
          <tr className="border-t border-line">
            <td className="px-4 py-2 font-sans text-ink-2">Year-1 total in home dollars</td>
            {items.map((it) => (
              <td key={it.package.id} className="px-4 py-2 text-right">
                {formatMoney(it.result.year1ColAdjusted)}
                <SourceMark source="bea" detail={colDetail(it.result, sources)} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
