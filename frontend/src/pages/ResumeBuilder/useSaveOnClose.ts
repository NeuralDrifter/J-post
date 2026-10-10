// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect } from 'react'
import type { StoreApi } from 'zustand'
import type { EditorState } from './editorStore'

/** Anything still unsaved is saved when the editor closes. */
export function useSaveOnClose<T>(store: StoreApi<EditorState<T>>) {
  useEffect(
    () => () => {
      store.getState().dispose()
      void store.getState().saveNow()
    },
    [store],
  )
}
