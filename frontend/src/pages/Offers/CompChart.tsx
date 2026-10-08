// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { app } from '../../lib/backend'
import { formatMoney } from '../../lib/format'
import { formatMoneyFull, PART_COLORS } from '../../lib/comp'

const PARTS = ['base', 'bonus', 'signing', 'equity', 'benefits'] as const
const PART_LABEL: Record<(typeof PARTS)[number], string> = {
  base: 'Base',
  bonus: 'Bonus',
  signing: 'Signing',
  equity: 'Equity',
  benefits: 'Benefits',
}

/** Stacked bars: one group per year, one bar per selected package. Inline SVG, no chart library. */
export function CompChart({ items }: { items: app.ComparisonItem[] }) {
  const H = 220
  const barW = 18
  const gap = 6
  const groupGap = 28
  const groupW = items.length * (barW + gap) - gap
  const W = 4 * groupW + 3 * groupGap + 56
  const max = Math.max(1, ...items.flatMap((it) => it.result.years.map((y) => PARTS.reduce((s, k) => s + Math.max(0, y[k]), 0))))
  const scale = (v: number) => (Math.max(0, v) / max) * (H - 24)
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f))

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="label-mono mr-auto">Year by year</h3>
        {PARTS.map((k) => (
          <span key={k} className="flex items-center gap-1.5 font-mono text-[11px] text-ink-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PART_COLORS[k] }} />
            {PART_LABEL[k]}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg width={W} height={H + 36} role="img" aria-label="Total compensation by year for each selected package">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={48} x2={W} y1={H - scale(t)} y2={H - scale(t)} stroke="rgb(255 255 255 / 0.06)" />
              <text x={44} y={H - scale(t) + 3} textAnchor="end" className="fill-ink-3 font-mono text-[10px]">
                {formatMoney(t)}
              </text>
            </g>
          ))}
          {[0, 1, 2, 3].map((yi) => {
            const gx = 56 + yi * (groupW + groupGap)
            return (
              <g key={yi}>
                {items.map((it, i) => {
                  const y = it.result.years[yi]
                  let top = H
                  return (
                    <g key={it.package.id}>
                      <title>{`${it.company} · ${it.package.label} · Year ${yi + 1}: ${formatMoneyFull(y.total)}`}</title>
                      {PARTS.map((k) => {
                        const h = scale(y[k])
                        top -= h
                        return h > 0 ? <rect key={k} x={gx + i * (barW + gap)} y={top} width={barW} height={h} fill={PART_COLORS[k]} rx={2} /> : null
                      })}
                    </g>
                  )
                })}
                <text x={gx + groupW / 2} y={H + 16} textAnchor="middle" className="fill-ink-2 font-mono text-[11px]">
                  Year {yi + 1}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-1 font-mono text-[10px] text-ink-3">Bars left to right: {items.map((it) => `${it.company} (${it.package.label})`).join(' · ')}</p>
    </div>
  )
}
