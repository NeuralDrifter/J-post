// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { Draft } from 'immer'
import { toast } from '../../lib/toast'
import type { ResumeData } from '../../lib/resumes/document'
import { useEditorStore } from './editorContext'

/** An edit made for the author (a fix, an applied template), confirmed in a toast whose Undo takes it back. */
export function useEditWithUndo() {
  const store = useEditorStore()
  return (recipe: (draft: Draft<ResumeData>) => void, message: string) => {
    store.getState().update(recipe)
    toast.info(message, { label: 'Undo', onClick: () => store.getState().undo() })
  }
}
