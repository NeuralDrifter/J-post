// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { main } from './backend'
import { blankPackage, formatDelta, formatMoneyFull, ordinal, percentileLabel } from './comp'
import { baselineDetail, colDetail, marketDetail, taxDetail } from './sources'

describe('money formatting', () => {
  it('formats full amounts and signed deltas', () => {
    expect(formatMoneyFull(219500)).toBe('$219,500')
    expect(formatMoneyFull(0)).toBe('$0')
    expect(formatDelta(99500)).toBe('+$99,500')
    expect(formatDelta(-5000)).toBe('−$5,000')
    expect(formatDelta(0)).toBe('±$0')
  })
})

describe('percentiles', () => {
  it('uses ordinals and qualifiers', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(13)).toBe('13th')
    expect(percentileLabel({ percentile: 62.5, qualifier: '' } as main.MarketResult)).toBe('63rd')
    expect(percentileLabel({ percentile: 10, qualifier: 'below' } as main.MarketResult)).toBe('<10th')
    expect(percentileLabel({ percentile: 75, qualifier: 'above' } as main.MarketResult)).toBe('≥75th')
  })
})

describe('blankPackage', () => {
  it('starts with safe defaults', () => {
    const p = blankPackage('offer', 'j1')
    expect(p.kind).toBe('offer')
    expect(p.jobId).toBe('j1')
    expect(p.vesting).toBe('standard')
    expect(p.equityType).toBe('none')
    expect(p.label).toBe('Offer')
  })
})

describe('source details', () => {
  const sources = { bls: { release: 'May 2025' }, bea: { release: '2024' } } as main.DataSources

  it('names the occupation, area and fallback level for market data', () => {
    const m = { occTitle: 'Software Developers', occCode: '15-1252', areaTitle: 'Colorado', level: 'state' } as main.MarketResult
    expect(marketDetail(m, sources)).toBe(
      'BLS OEWS May 2025 · Software Developers (15-1252) · Colorado — state-level figures (no metro data for this occupation)',
    )
    expect(marketDetail({ ...m, areaTitle: 'Denver', level: 'area' } as main.MarketResult, sources)).toBe(
      'BLS OEWS May 2025 · Software Developers (15-1252) · Denver',
    )
  })

  it('explains cost-of-living indexes', () => {
    const r = { colAreaTitle: 'Denver', colIndex: 108.5, homeAreaTitle: 'U.S.', homeColIndex: 100, colLevel: 'metro' } as main.PackageResult
    expect(colDetail(r, sources)).toBe('BEA Regional Price Parities 2024 · Denver 108.5 vs U.S. 100 (US average = 100)')
  })

  it('describes the tax basis', () => {
    const t = { year: 2026, stateName: 'Colorado', stateSource: 'Tax Foundation 2026' } as main.TaxResult
    expect(taxDetail(t)).toBe('Tax year 2026 · federal (IRS) + Colorado (Tax Foundation 2026) · estimate')
    expect(taxDetail({ year: 2026, stateName: '', stateSource: '' } as main.TaxResult)).toBe('Tax year 2026 · federal (IRS), no state tax · estimate')
  })
})

describe('baselineDetail', () => {
  it('names the median, occupation, area and fallback level', () => {
    const sources = { bls: { release: 'May 2025' } } as main.DataSources
    const b = { occTitle: 'Software Developers', areaTitle: 'Denver-Aurora-Centennial, CO', level: 'area', median: 150000, baseDelta: 10000 } as main.MarketBaseline
    expect(baselineDetail(b, sources)).toBe('BLS OEWS May 2025 · median pay $150,000 for Software Developers · Denver-Aurora-Centennial, CO · base salary only')
    expect(baselineDetail({ ...b, level: 'national', areaTitle: 'U.S.' } as main.MarketBaseline, sources)).toContain('national figures')
  })
})
