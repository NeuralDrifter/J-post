// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** Hand-written credits shown under the generated library list. */
export type Credit = { name: string; detail: string; license?: string; url: string }

/** Tools that helped build Job Track. AI coding help is credited here by model name, not in commits. */
export const BUILT_WITH: Credit[] = [
  {
    name: 'Claude Opus 5.5 (Anthropic)',
    detail: 'AI coding assistance.',
    url: 'https://www.anthropic.com/claude',
  },
  {
    name: 'Google Stitch',
    detail: "The app's visual design ideas came from a Stitch mockup (Obsidian Lumina). No mockup code was copied.",
    url: 'https://stitch.withgoogle.com/',
  },
]

/** Datasets the Offers page draws on (marked ✦¹ ✦² ✦³ there). */
export const DATA: Credit[] = [
  {
    name: 'BLS Occupational Employment and Wage Statistics, May 2025',
    detail: 'Pay percentiles by occupation and metro area.',
    license: 'Public domain (US government)',
    url: 'https://www.bls.gov/oes/',
  },
  {
    name: 'BEA Regional Price Parities, 2024',
    detail: 'Cost of living by metro area, state metro/nonmetro portion, and state.',
    license: 'Public domain (US government)',
    url: 'https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area',
  },
  {
    name: 'IRS Rev. Proc. 2025-32 and SSA 2026 figures',
    detail: 'Federal brackets, standard deductions, the Social Security wage base and the 401(k) limit.',
    license: 'Public domain (US government)',
    url: 'https://www.irs.gov/',
  },
  {
    name: 'Tax Foundation, State Individual Income Tax Rates and Brackets, 2026',
    detail: 'State income tax rates and brackets, compiled by the Tax Foundation.',
    url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/',
  },
]

/** Services Job Track connects to with your own accounts and keys. */
export const SERVICES: Credit[] = [
  { name: 'Adzuna', detail: 'Job search API.', url: 'https://developer.adzuna.com/' },
  { name: 'USAJobs', detail: 'Federal job search API.', url: 'https://developer.usajobs.gov/' },
  { name: 'Himalayas', detail: 'Remote job API.', url: 'https://himalayas.app/' },
  { name: 'Jobicy', detail: 'Remote job API.', url: 'https://jobicy.com/' },
  { name: 'The Muse', detail: 'Job listings API.', url: 'https://www.themuse.com/developers/api/v2' },
  {
    name: 'JobSpy',
    detail: 'Indeed, LinkedIn and ZipRecruiter search; runs from your own Python, not bundled.',
    license: 'MIT',
    url: 'https://github.com/speedyapply/JobSpy',
  },
  { name: 'Google Gemini', detail: 'Live interviews, tips, grading and question plans.', url: 'https://ai.google.dev/' },
  { name: 'Anthropic API and Claude Code', detail: 'Grading, tips and question plans.', url: 'https://www.anthropic.com/' },
  { name: 'OpenAI', detail: 'Grading, tips and question plans.', url: 'https://platform.openai.com/' },
  { name: 'DeepSeek', detail: 'Grading, tips and question plans.', url: 'https://platform.deepseek.com/' },
  { name: 'Ollama', detail: 'Local models on your own computer.', url: 'https://ollama.com/' },
  { name: 'LM Studio', detail: 'Local models on your own computer.', url: 'https://lmstudio.ai/' },
]

/** Projects whose ideas or research shaped Job Track, without their code being copied. */
export const THANKS: Credit[] = [
  {
    name: 'ATS Screener',
    detail: 'Its research notes on how applicant tracking systems parse and rank resumes.',
    license: 'MIT',
    url: 'https://github.com/sunnypatell/ats-screener',
  },
]
