import type { main } from './backend'

export const PACKAGE_KINDS = ['offer', 'estimate', 'counter', 'current'] as const
export type PackageKind = (typeof PACKAGE_KINDS)[number]

export const KIND_LABEL: Record<PackageKind, string> = {
  offer: 'Offer',
  estimate: 'Estimate',
  counter: 'Counter',
  current: 'Current job',
}

export type ChipTone = 'success' | 'info' | 'accent' | 'neutral'

export const KIND_TONE: Record<PackageKind, ChipTone> = {
  offer: 'success',
  estimate: 'info',
  counter: 'accent',
  current: 'neutral',
}

export const VESTINGS = ['standard', 'backloaded', 'monthly', 'custom'] as const
export type Vesting = (typeof VESTINGS)[number]

export const VESTING_LABEL: Record<Vesting, string> = {
  standard: '4 years, 1-year cliff (25% yearly)',
  backloaded: 'Backloaded (5 / 15 / 40 / 40)',
  monthly: '4 years monthly, no cliff',
  custom: 'Custom yearly %',
}

export const EQUITY_TYPES = ['none', 'rsu', 'options'] as const
export type Equity = (typeof EQUITY_TYPES)[number]

export const EQUITY_LABEL: Record<Equity, string> = { none: 'None', rsu: 'RSUs', options: 'Stock options' }

export const FILING_STATUSES = ['single', 'married', 'head'] as const
export type Filing = (typeof FILING_STATUSES)[number]

export const FILING_LABEL: Record<Filing, string> = {
  single: 'Single',
  married: 'Married filing jointly',
  head: 'Head of household',
}

/** Chart/legend colors for each part of total comp. */
export const PART_COLORS = {
  base: '#6366f1',
  bonus: '#8b5cf6',
  signing: '#f59e0b',
  equity: '#06b6d4',
  benefits: '#10b981',
} as const

export function blankPackage(kind: PackageKind, jobId = ''): main.CompPackage {
  return {
    id: '',
    jobId,
    kind,
    label: KIND_LABEL[kind],
    parentId: '',
    baseSalary: 0,
    signingBonus: 0,
    signingClawbackMonths: 0,
    targetBonusPct: 0,
    annualRaisePct: 0,
    equityType: 'none',
    rsuGrantValue: 0,
    optionShares: 0,
    optionStrike: 0,
    shareValue: 0,
    vesting: 'standard',
    vestingCustom: '',
    k401MatchPct: 0,
    k401MatchCapPct: 0,
    k401ContribPct: 0,
    healthPremiumAnnual: 0,
    stipendsAnnual: 0,
    otherAnnual: 0,
    ptoDays: 0,
    occupationCode: '',
    areaCode: '',
    taxState: '',
    localTaxPct: 0,
    notes: '',
    createdAt: '',
    updatedAt: '',
  }
}

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 219500 → "$219,500" */
export function formatMoneyFull(n: number): string {
  return `$${fmt.format(Math.round(n))}`
}

/** 99500 → "+$99,500", -5000 → "−$5,000" */
export function formatDelta(n: number): string {
  if (n === 0) return '±$0'
  return `${n > 0 ? '+' : '−'}${formatMoneyFull(Math.abs(n))}`
}

export function ordinal(n: number): string {
  const v = Math.round(n)
  const tens = v % 100
  if (tens >= 11 && tens <= 13) return `${v}th`
  return `${v}${{ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] ?? 'th'}`
}

/** "63rd", "<10th" (under the lowest published point), "≥75th" (at/over the highest known point). */
export function percentileLabel(m: main.MarketResult): string {
  const base = ordinal(m.percentile)
  if (m.qualifier === 'below') return `<${base}`
  if (m.qualifier === 'above') return `≥${base}`
  return base
}

/** States + DC for the tax-state picker (codes match taxdata/us_2026.json). */
export const STATES: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
  ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
]
