// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { produce, type Draft } from 'immer'
import { syncResumeDates } from '@reactive-resume/schema/resume/dates'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ResumeData } from '../../lib/resumes/document'

export const AUTOSAVE_DELAY_MS = 800
export const MAX_HISTORY = 100

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

/** Saves a version of the resume; resolves false if it failed (the caller already said why). */
export type SaveResume = (data: ResumeData) => Promise<boolean>

export type EditorState = {
  data: ResumeData
  saveState: SaveState
  /** Applies an edit (an immer recipe); it can be undone, and it autosaves after a pause. */
  update: (recipe: (draft: Draft<ResumeData>) => void) => void
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
 * The builder's document: the resume being edited, its undo history and its
 * autosave. Only one save runs at a time; edits made meanwhile are saved after it.
 */
export function createEditorStore(initial: ResumeData, save: SaveResume): StoreApi<EditorState> {
  let past: ResumeData[] = []
  let future: ResumeData[] = []
  let savedData = initial
  let saving = false
  let timer: ReturnType<typeof setTimeout> | undefined

  return createStore<EditorState>()((set, get) => {
    const scheduleSave = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void get().saveNow(), AUTOSAVE_DELAY_MS)
    }

    const show = (data: ResumeData) => {
      set({ data, saveState: 'unsaved' })
      scheduleSave()
    }

    const finishSave = (saved: ResumeData, ok: boolean) => {
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
      update: (recipe) => {
        const current = get().data
        const next = produce(current, (draft) => {
          recipe(draft)
          // The printed date text ("Mar 2022 – Present") follows the structured dates, as upstream keeps it.
          syncResumeDates(draft as ResumeData)
        })
        if (next === current) return
        past = [...past, current].slice(-MAX_HISTORY)
        future = []
        show(next)
      },
      undo: () => {
        const previous = past.at(-1)
        if (!previous) return
        past = past.slice(0, -1)
        future = [get().data, ...future]
        show(previous)
      },
      redo: () => {
        const [next, ...rest] = future
        if (!next) return
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
