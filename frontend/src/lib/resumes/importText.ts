// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The text a PDF or Word import was read from, kept for this app session so the builder can offer to tidy
// the import with AI. Storage can be unavailable; then there's simply nothing to offer.

const key = (docId: string) => `import-text:${docId}`

export function keepImportText(docId: string, text: string) {
  try {
    sessionStorage.setItem(key(docId), text)
  } catch {
    // Without storage the tidy isn't offered; the import itself is unaffected.
  }
}

export function importTextFor(docId: string): string {
  try {
    return sessionStorage.getItem(key(docId)) ?? ''
  } catch {
    return ''
  }
}

export function forgetImportText(docId: string) {
  try {
    sessionStorage.removeItem(key(docId))
  } catch {
    // Nothing kept, nothing to forget.
  }
}
