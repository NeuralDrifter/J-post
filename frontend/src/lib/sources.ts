// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { MarketSources, type main, type marketdata } from './backend'
import { useStaticData } from './staticData'

// Every figure derived from an outside dataset carries a numbered ✦ mark.
export type SourceKey = 'bls' | 'bea' | 'tax'
export const SOURCE_NUMBER: Record<SourceKey, number> = { bls: 1, bea: 2, tax: 3 }

const LEVEL_NOTE: Record<string, string> = {
  state: 'state-level figures (no metro data for this occupation)',
  national: 'national figures (no local data for this occupation)',
}

export function marketDetail(m: marketdata.MarketResult, sources?: main.DataSources): string {
  const base = `BLS OEWS ${sources?.bls.release ?? ''} · ${m.occTitle} (${m.occCode}) · ${m.areaTitle}`
  return LEVEL_NOTE[m.level] ? `${base} — ${LEVEL_NOTE[m.level]}` : base
}

export function baselineDetail(b: main.MarketBaseline, sources?: main.DataSources): string {
  const base = `BLS OEWS ${sources?.bls.release ?? ''} · median pay $${b.median.toLocaleString('en-US')} for ${b.occTitle} · ${b.areaTitle} · base salary only`
  return LEVEL_NOTE[b.level] ? `${base} — ${LEVEL_NOTE[b.level]}` : base
}

export function colDetail(r: main.PackageResult, sources?: main.DataSources): string {
  const base = `BEA Regional Price Parities ${sources?.bea.release ?? ''} · ${r.colAreaTitle} ${r.colIndex} vs ${r.homeAreaTitle} ${r.homeColIndex} (US average = 100)`
  return r.colLevel && r.colLevel !== 'metro' && r.colLevel !== 'national' ? `${base} — ${r.colLevel} index used` : base
}

export function taxDetail(t: main.TaxResult): string {
  const state = t.stateName ? ` + ${t.stateName} (${t.stateSource})` : ', no state tax'
  return `Tax year ${t.year || 2026} · federal (IRS)${state} · estimate`
}

/** Dataset names, releases and links. */
export function useSources(): main.DataSources | undefined {
  return useStaticData('dataSources', MarketSources)
}
