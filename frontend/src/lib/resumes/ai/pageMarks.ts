// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT
//
// markChange is derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266,
// apps/web/src/features/resume/editor/proposals/proposals.ts. Copyright (c) 2026 Amruth Pillai, MIT.

import { splitBlock, splitBlocks } from '@reactive-resume/resume/proposals'

// The page marks, as the PDF needs them: old text struck through in grey, new text on a pale green highlight.
const OLD_TEXT_COLOR = '#7d7b73'
const NEW_TEXT_BACKGROUND = '#d4efd9'

const struck = (html: string) => `<s style="color: ${OLD_TEXT_COLOR}">${html}</s>`
const highlighted = (html: string) => `<mark data-color="${NEW_TEXT_BACKGROUND}">${html}</mark>`

/** The old text struck through, then the new text highlighted, inside the passage's own block. For the preview only. */
export function markChange(before: string, after: string): string {
  // An addition keeps the passage and adds a block after it: only the new block is marked.
  if (after.startsWith(before) && after.length > before.length) {
    const added = after.slice(before.length)
    const marked = splitBlocks(added).reduce((html, block) => {
      const parts = splitBlock(block.html)
      return parts ? html.replace(block.html, () => `${parts.open}${highlighted(parts.inner)}${parts.close}`) : html
    }, added)
    return `${before}${marked === added ? highlighted(added) : marked}`
  }

  const old = splitBlock(before)
  const next = splitBlock(after)
  if (!old || !next) return `${struck(before)} ${highlighted(after)}`
  return `${old.open}${struck(old.inner)} ${highlighted(next.inner)}${old.close}`
}
