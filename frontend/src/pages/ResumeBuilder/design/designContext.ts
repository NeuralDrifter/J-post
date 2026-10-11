// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react'
import type { Draft } from 'immer'
import type { ResumeData, Template } from '../../../lib/resumes/document'
import type { PrintablePage } from '../../../lib/resumes/stored'

/** The design every document shares: template, type, colours, page and custom CSS (letters have no layout or notes). */
export type DesignMetadata = Omit<ResumeData['metadata'], 'notes' | 'layout'>

export type DesignEditor = {
  metadata: DesignMetadata
  updateMetadata: (recipe: (metadata: Draft<DesignMetadata>) => void) => void
  undo: () => void
  /** The document as it prints, for the template gallery's thumbnails. */
  page: PrintablePage
  /** Shows the page in another template while it's hovered in the gallery; null puts it back. */
  previewTemplate: (template: Template | null) => void
}

/** Lets the design sections edit a resume's or a letter's design without knowing which. */
export const DesignContext = createContext<DesignEditor | null>(null)

export function useDesign(): DesignEditor {
  const editor = useContext(DesignContext)
  if (!editor) throw new Error('useDesign is only usable inside a document editor')
  return editor
}
