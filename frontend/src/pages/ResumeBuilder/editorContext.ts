// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react'
import { useStore, type StoreApi } from 'zustand'
import type { ResumeData } from '../../lib/resumes/document'
import type { EditorState } from './editorStore'

export type ResumeEditorState = EditorState<ResumeData>

export const EditorContext = createContext<StoreApi<ResumeEditorState> | null>(null)

/** The open resume's editor store itself. */
export function useEditorStore(): StoreApi<ResumeEditorState> {
  const store = useContext(EditorContext)
  if (!store) throw new Error('useEditor is only usable inside the resume builder')
  return store
}

/** Reads from the open resume's editor store; re-renders only when the selected value changes. */
export function useEditor<T>(selector: (state: ResumeEditorState) => T): T {
  return useStore(useEditorStore(), selector)
}

export const useResume = () => useEditor((s) => s.data)
export const useUpdate = () => useEditor((s) => s.update)
