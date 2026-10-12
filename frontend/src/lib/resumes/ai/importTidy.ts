// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Tidy an import: the file's text and the sections as imported, so the model can put each piece where it belongs.

import { createEntry, getSectionType } from '@reactive-resume/web/features/resume/editor/write/model'
import type { ResumeData } from '../document'

/** The material for an import tidy: the text, and each built-in section with its entries and a blank entry. */
export function importTidyMaterial(data: ResumeData, text: string): { input: string; context: string } {
  const sections = Object.entries(data.sections).flatMap(([id, section]) => {
    const type = getSectionType(data, id)
    if (!type) return []
    const { id: _blankId, hidden: _hidden, ...blank } = createEntry(type) as Record<string, unknown>
    return [{ id, items: section.items, blank }]
  })
  return { input: JSON.stringify({ text, sections }), context: '{}' }
}
