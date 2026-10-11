// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** The fields of a stored document the library needs. */
export type LibraryDocument = { id: string; kind: string; name: string; data: string; updatedAt: string }

/** The default resume first, the rest as they came (newest first), filtered by name. */
export function libraryOrder<T extends LibraryDocument>(docs: T[], defaultId: string, query: string): T[] {
  const q = query.trim().toLowerCase()
  const shown = q ? docs.filter((d) => d.name.toLowerCase().includes(q)) : docs
  const isDefault = (d: T) => d.id === defaultId
  return [...shown.filter(isDefault), ...shown.filter((d) => !isDefault(d))]
}

/** The template a stored document uses (a letter's is in its style), read without validating it; "" if unknown. */
export function templateOf(doc: LibraryDocument): string {
  try {
    const data = JSON.parse(doc.data)
    const template = (data?.style ?? data)?.metadata?.template
    return typeof template === 'string' ? template : ''
  } catch {
    return ''
  }
}

export function templateLabel(template: string): string {
  return template.charAt(0).toUpperCase() + template.slice(1)
}

/** Words in a document's text, for its details. */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0
}
