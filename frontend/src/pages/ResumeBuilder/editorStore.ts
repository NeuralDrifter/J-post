// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce, type Draft } from 'immer'
import { createStore, type StoreApi } from 'zustand/vanilla'

export const AUTOSAVE_DELAY_MS = 800
export const MAX_HISTORY = 100

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

/** Saves a version of the document; resolves false if it failed (the caller already said why). */
export type SaveDocument<T> = (data: T) => Promise<boolean>

/** Runs after every edit, inside it, to keep derived fields in step (resumes: the printed date text). */
export type Normalize<T> = (draft: Draft<T>) => void

export type EditorState<T> = {
  data: T
  saveState: SaveState
  /** A locked document ignores edits, undo and redo; the backend refuses them too. */
  locked: boolean
  setLocked: (locked: boolean) => void
  /** Applies an edit (an immer recipe); it can be undone, and it autosaves after a pause. */
  update: (recipe: (draft: Draft<T>) => void) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Saves now instead of waiting for the pause. */
  saveNow: () => Promise<void>
  /** Stops the pending autosave timer, e.g. when the editor closes. */
  dispose: () => void
}

/**
 * An open document (a resume or a letter): its content, undo history and
 * autosave. Only one save runs at a time; edits made meanwhile are saved after it.
 */
export function createEditorStore<T>(initial: T, save: SaveDocument<T>, normalize?: Normalize<T>): StoreApi<EditorState<T>> {
  let past: T[] = []
  let future: T[] = []
  let savedData = initial
  let saving = false
  let timer: ReturnType<typeof setTimeout> | undefined

  return createStore<EditorState<T>>()((set, get) => {
    const scheduleSave = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void get().saveNow(), AUTOSAVE_DELAY_MS)
    }

    const show = (data: T) => {
      set({ data, saveState: 'unsaved' })
      scheduleSave()
    }

    const finishSave = (saved: T, ok: boolean) => {
      saving = false
      if (!ok) {
        set({ saveState: 'error' })
        return
      }
      savedData = saved
      const changedMeanwhile = get().data !== savedData
      set({ saveState: changedMeanwhile ? 'unsaved' : 'saved' })
      if (changedMeanwhile) scheduleSave()
    }

    return {
      data: initial,
      saveState: 'saved',
      locked: false,
      setLocked: (locked) => set({ locked }),
      update: (recipe) => {
        if (get().locked) return
        const current = get().data
        const next = produce(current, (draft) => {
          recipe(draft)
          normalize?.(draft)
        })
        if (next === current) return
        past = [...past, current].slice(-MAX_HISTORY)
        future = []
        show(next)
      },
      undo: () => {
        const previous = past.at(-1)
        if (!previous || get().locked) return
        past = past.slice(0, -1)
        future = [get().data, ...future]
        show(previous)
      },
      redo: () => {
        const [next, ...rest] = future
        if (!next || get().locked) return
        future = rest
        past = [...past, get().data]
        show(next)
      },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      saveNow: async () => {
        clearTimeout(timer)
        if (saving) return // the running save reschedules if anything changed meanwhile
        const snapshot = get().data
        if (snapshot === savedData && get().saveState !== 'error') return
        saving = true
        set({ saveState: 'saving' })
        finishSave(snapshot, await save(snapshot))
      },
      dispose: () => clearTimeout(timer),
    }
  })
}
