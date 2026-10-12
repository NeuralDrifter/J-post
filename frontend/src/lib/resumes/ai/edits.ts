// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The edits a model may suggest. It never writes paths into the document: each
// edit names a passage, section or entry by the id the builder sent, and the
// builder works out the change against the document as it is now.

import { z } from 'zod'

const why = z.string().catch('')
const addsFacts = z.boolean().catch(false)
const textEdit = { passageId: z.string(), text: z.string(), why, addsFacts }

export const editSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rewrite'), ...textEdit }),
  z.object({ kind: z.literal('addAfter'), ...textEdit }),
  z.object({ kind: z.literal('setHeadline'), text: z.string(), why }),
  z.object({ kind: z.literal('orderSkills'), itemIds: z.array(z.string()), why }),
  z.object({ kind: z.literal('addSkill'), name: z.string(), keywords: z.array(z.string()).catch([]), why }),
  z.object({ kind: z.literal('hideItem'), sectionId: z.string(), itemId: z.string(), why }),
  z.object({ kind: z.literal('replaceSection'), sectionId: z.string(), items: z.array(z.record(z.string(), z.unknown())), why }),
  z.object({ kind: z.literal('setBody'), text: z.string(), why }),
])

export type Edit = z.infer<typeof editSchema>
export type EditOf<K extends Edit['kind']> = Extract<Edit, { kind: K }>

/** A generation's edits by position; one the model got wrong is null, so the others keep their keys. */
export function parseEdits(json: string): (Edit | null)[] {
  try {
    const raw = (JSON.parse(json) as { edits?: unknown }).edits
    if (!Array.isArray(raw)) return []
    return raw.map((edit) => {
      const parsed = editSchema.safeParse(edit)
      return parsed.success ? parsed.data : null
    })
  } catch {
    return []
  }
}
