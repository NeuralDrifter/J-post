// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// What the Custom CSS editor knows about the document: the blocks a rule can
// aim at (for autocomplete and hover help), the colours written in it (for
// swatches) and the errors that stop it applying. Follows Reactive Resume's
// stylesheet editor (MIT).
import { buildSemanticTree, getTemplateSemanticManifest, semanticNodeKeys, shouldShowResumeHeader } from '@reactive-resume/pdf/semantic-tree'
import { compileStylesheet, isFatalStylesheetDiagnostic, type SemanticNode } from '@reactive-resume/resume/stylesheet'
import { collectCompiledColorTokens, type SemanticCssColorToken } from '@reactive-resume/web/features/resume/stylesheet/color-tokens'
import type { SemanticCssEditorMetadata } from '@reactive-resume/web/features/resume/stylesheet/protocol'
import { listStyleTargets } from '@reactive-resume/web/features/resume/stylesheet/targets'
import type { ResumeData } from '../../../lib/resumes/document'

export const STYLESHEET_LANGUAGE_VERSION = 1

/** Every page's blocks as one tree, the template's named parts, and each section and entry by name. */
export function editorMetadata(data: ResumeData): SemanticCssEditorMetadata {
  const pages = data.metadata.layout.pages.map((page, index) =>
    buildSemanticTree({ data, template: data.metadata.template, page, pageNumber: index + 1, showHeader: shouldShowResumeHeader(data, index) }),
  )
  const semanticTree: SemanticNode = {
    key: semanticNodeKeys.resume(),
    kind: 'resume',
    attributes: { template: data.metadata.template },
    roles: [],
    children: pages.flatMap(({ children }) => children),
  }
  return {
    semanticTree,
    templateParts: getTemplateSemanticManifest(data.metadata.template).parts.map(({ name }) => name),
    targets: listStyleTargets(data, semanticTree),
  }
}

export type CompiledStylesheet = { errors: string[]; colorTokens: readonly SemanticCssColorToken[] }

/** Compiles the stylesheet as the PDF will: the errors that keep it from applying, and the colours to swatch. */
export function compileForEditor(text: string): CompiledStylesheet {
  if (!text.trim()) return { errors: [], colorTokens: [] }
  const { program, diagnostics } = compileStylesheet({ languageVersion: STYLESHEET_LANGUAGE_VERSION, text })
  return {
    errors: diagnostics.filter(isFatalStylesheetDiagnostic).map((diagnostic) => diagnostic.message),
    colorTokens: collectCompiledColorTokens(text, program),
  }
}

/** Replaces one colour in the stylesheet, e.g. after it's picked from its swatch. */
export function replaceColor(text: string, token: SemanticCssColorToken, color: string): string {
  return text.slice(0, token.from) + color + text.slice(token.to)
}
