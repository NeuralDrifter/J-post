// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import type { StoreApi } from 'zustand'
import { api } from '../../../lib/api'
import { RestoreDocumentVersion, type app } from '../../../lib/backend'
import { toast } from '../../../lib/toast'
import type { EditorState } from '../editorStore'
import type { PreviewedVersion } from './HistoryPanel'

/**
 * The History panel's state for an open document: the version previewed on the page, and
 * restoring one. A restore saves pending edits first, then hands the restored document to
 * `onRestored`, which reopens the editor on it.
 */
export function useVersionHistory<T>(docId: string, store: StoreApi<EditorState<T>>, plainText: (data: T) => string, onRestored: (doc: app.Document) => void) {
  const [previewed, setPreviewed] = useState<PreviewedVersion | null>(null)
  const flush = () => store.getState().saveNow()

  const restore = async (version: PreviewedVersion) => {
    await flush()
    const restored = await api(RestoreDocumentVersion(docId, version.id))
    if (!restored) return
    toast.success(`Restored “${version.title}”. What you had is saved as “Before restore”.`)
    setPreviewed(null)
    onRestored(restored)
  }

  return {
    docId,
    previewed,
    onPreview: setPreviewed,
    flush,
    onRestore: (version: PreviewedVersion) => void restore(version),
    nowText: () => plainText(store.getState().data),
  }
}
