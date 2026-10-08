// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { SourceMark } from '../../components/SourceMark'
import type { main } from '../../lib/backend'
import { formatMoneyFull, percentileLabel } from '../../lib/comp'
import { formatMoney } from '../../lib/format'
import { marketDetail } from '../../lib/sources'

const POINT_LABELS = ['p10', 'p25', 'median', 'p75', 'p90']

/** Where each base salary sits on the local pay curve for its occupation. */
export function MarketStrips({ items, sources }: { items: main.ComparisonItem[]; sources?: main.DataSources }) {
  const withMarket = items.filter((it) => it.result.market)
  if (withMarket.length === 0) return null
  return (
    <section className="glass space-y-4 rounded-2xl p-4">
      <h3 className="label-mono">Market pay for the role</h3>
      {withMarket.map((it) => {
        const m = it.result.market!
        const known = m.points.filter((v) => v > 0)
        const lo = Math.min(...known, it.package.baseSalary) * 0.9
        const hi = Math.max(...known, it.package.baseSalary) * 1.05
        const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
        return (
          <div key={it.package.id}>
            <p className="mb-5 text-xs text-ink-2">
              <span className="font-semibold text-ink">{it.company}</span> · base {formatMoneyFull(it.package.baseSalary)} is the{' '}
              <span className="font-mono text-ink">{percentileLabel(m)}</span> percentile for {m.occTitle} in {m.areaTitle}
              <SourceMark source="bls" detail={marketDetail(m, sources)} />
            </p>
            <div className="relative mx-2 h-2 rounded-full bg-linear-to-r from-white/5 via-info/30 to-success/40">
              {m.points.map((v, i) =>
                v > 0 ? (
                  <span key={i} className="absolute top-3 -translate-x-1/2 text-center font-mono text-[9px] leading-tight text-ink-3" style={{ left: x(v) }}>
                    {POINT_LABELS[i]}
                    <br />
                    {formatMoney(v)}
                  </span>
                ) : v === -1 ? (
                  <span key={i} className="absolute top-3 right-0 font-mono text-[9px] text-ink-3">
                    {POINT_LABELS[i]} ≥ $239k
                  </span>
                ) : null,
              )}
              <span
                className="absolute -top-1.5 h-5 w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_white]"
                style={{ left: x(it.package.baseSalary) }}
                title={`Base ${formatMoneyFull(it.package.baseSalary)}`}
              />
            </div>
            <div className="h-7" />
          </div>
        )
      })}
    </section>
  )
}

/** What the equity is worth over 4 years if the share price changes. */
export function ScenariosTable({ items }: { items: main.ComparisonItem[] }) {
  const withEquity = items.filter((it) => it.result.scenarios.length > 0)
  if (withEquity.length === 0) return null
  const multipliers = withEquity[0].result.scenarios.map((s) => s.multiplier)
  return (
    <section className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-raised/60">
          <tr>
            <th className="label-mono px-4 py-2.5 text-left font-normal">4-year equity if shares are worth…</th>
            {multipliers.map((m) => (
              <th key={m} className="px-4 py-2.5 text-right font-mono text-xs">
                {m}× today
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-xs">
          {withEquity.map((it) => (
            <tr key={it.package.id} className="border-t border-line">
              <td className="px-4 py-2 font-sans">
                {it.company} <span className="text-ink-3">· {it.package.label}</span>
              </td>
              {it.result.scenarios.map((s) => (
                <td key={s.multiplier} className={`px-4 py-2 text-right ${s.multiplier === 1 ? 'font-bold' : ''}`}>
                  {formatMoneyFull(s.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
        Options are valued at share value minus strike price; 0× shows the worst case.
      </p>
    </section>
  )
}
