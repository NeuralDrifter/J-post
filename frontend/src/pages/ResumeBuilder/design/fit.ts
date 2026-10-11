// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Fit to one page (or to the pages the layout has): tighten density, then
// margins, then text size, as Reactive Resume's Fit does, until it fits.
import { produce } from 'immer'
import {
  applyDensity,
  applyMargins,
  applyTextSize,
  fitToPages,
  matchDensity,
  matchMargins,
  type FitStep,
} from '@reactive-resume/web/features/resume/editor/design/presets'
import type { ResumeData } from '../../../lib/resumes/document'

/** The pages the layout asks for; content past them overflows. */
export const authoredPages = (data: ResumeData): number => Math.max(1, data.metadata.layout.pages.length)

/** How far the content runs over, or null when it fits (free-form pages grow instead). */
export function overflowOf(data: ResumeData, printedPages: number): { authored: number } | null {
  if (data.metadata.page.format === 'free-form') return null
  const authored = authoredPages(data)
  return printedPages > authored ? { authored } : null
}

const applyStep = (data: ResumeData, step: FitStep): ResumeData =>
  produce(data, (draft) => {
    if ('density' in step) applyDensity(draft.metadata, step.density)
    else if ('margins' in step) applyMargins(draft.metadata, step.margins)
    else applyTextSize(draft.metadata, step.size)
  })

/**
 * Tightens the design until `countPages` says it fits its authored pages. Resolves to the design to keep
 * (applied as one edit) and whether it fits; `countPages` renders a candidate and counts its pages.
 */
export async function fitDesign(data: ResumeData, countPages: (candidate: ResumeData) => Promise<number>) {
  let candidate = data
  const initial = { density: matchDensity(data.metadata), margins: matchMargins(data.metadata), size: data.metadata.typography.body.fontSize }
  const { fits } = await fitToPages(
    initial,
    (step) => void (candidate = applyStep(candidate, step)),
    async () => (await countPages(candidate)) <= authoredPages(candidate),
  )
  return { metadata: candidate.metadata, fits }
}
