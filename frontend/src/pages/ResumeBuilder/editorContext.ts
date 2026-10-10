// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react'
import { useStore, type StoreApi } from 'zustand'
import type { EditorState } from './editorStore'

export const EditorContext = createContext<StoreApi<EditorState> | null>(null)

/** Reads from the open resume's editor store; re-renders only when the selected value changes. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorContext)
  if (!store) throw new Error('useEditor is only usable inside the resume builder')
  return useStore(store, selector)
}

export const useResume = () => useEditor((s) => s.data)
export const useUpdate = () => useEditor((s) => s.update)
