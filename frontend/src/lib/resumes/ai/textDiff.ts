// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { diffLines } from 'diff'

/** One changed stretch between two versions' text: what it said, what it says (either may be empty). */
export type ChangedBlock = { before: string; after: string }

/**
 * The lines that differ between two versions of a document's text, in reading order. A removal followed by an
 * addition is one change, so its words can be compared side by side.
 */
export function changedBlocks(before: string, after: string): ChangedBlock[] {
  const blocks: ChangedBlock[] = []
  let open: ChangedBlock | null = null
  for (const part of diffLines(before, after)) {
    if (!part.added && !part.removed) {
      if (open) blocks.push(open)
      open = null
      continue
    }
    open ??= { before: '', after: '' }
    if (part.removed) open.before += part.value
    else open.after += part.value
  }
  if (open) blocks.push(open)
  return blocks.map((b) => ({ before: b.before.trimEnd(), after: b.after.trimEnd() }))
}
