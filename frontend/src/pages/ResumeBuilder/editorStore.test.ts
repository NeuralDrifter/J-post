// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newResumeData, type ResumeData } from '../../lib/resumes/document'
import { AUTOSAVE_DELAY_MS, createEditorStore, MAX_HISTORY } from './editorStore'

type SaveCall = { data: ResumeData; finish: (ok: boolean) => void }

/** A save function the test finishes by hand, so in-flight saves can be observed. */
function manualSaver() {
  const calls: SaveCall[] = []
  const save = (data: ResumeData) => new Promise<boolean>((resolve) => calls.push({ data, finish: resolve }))
  return { calls, save }
}

const setName = (name: string) => (draft: ResumeData) => {
  draft.basics.name = name
}

describe('editor store', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves the latest data once typing pauses', async () => {
    const { calls, save } = manualSaver()
    const store = createEditorStore(newResumeData('blank', 'onyx'), save)
    store.getState().update(setName('A'))
    store.getState().update(setName('Ada'))
    expect(store.getState().saveState).toBe('unsaved')

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.data.basics.name).toBe('Ada')
    expect(store.getState().saveState).toBe('saving')

    calls[0]!.finish(true)
    await vi.runAllTimersAsync()
    expect(store.getState().saveState).toBe('saved')
  })

  it('saves again after an edit made while a save was in flight', async () => {
    const { calls, save } = manualSaver()
    const store = createEditorStore(newResumeData('blank', 'onyx'), save)
    store.getState().update(setName('First'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    store.getState().update(setName('Second'))
    calls[0]!.finish(true)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(calls).toHaveLength(2)
    expect(calls[1]!.data.basics.name).toBe('Second')
    calls[1]!.finish(true)
    await vi.runAllTimersAsync()
    expect(store.getState().saveState).toBe('saved')
  })

  it('keeps the edits and reports an error when a save fails, then retries', async () => {
    const { calls, save } = manualSaver()
    const store = createEditorStore(newResumeData('blank', 'onyx'), save)
    store.getState().update(setName('Ada'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    calls[0]!.finish(false)
    await vi.runAllTimersAsync()
    expect(store.getState().saveState).toBe('error')
    expect(store.getState().data.basics.name).toBe('Ada')

    void store.getState().saveNow()
    expect(calls).toHaveLength(2)
    calls[1]!.finish(true)
    await vi.runAllTimersAsync()
    expect(store.getState().saveState).toBe('saved')
  })

  it('undoes and redoes edits', () => {
    const store = createEditorStore(newResumeData('blank', 'onyx'), manualSaver().save)
    store.getState().update(setName('A'))
    store.getState().update(setName('B'))
    store.getState().undo()
    expect(store.getState().data.basics.name).toBe('A')
    store.getState().redo()
    expect(store.getState().data.basics.name).toBe('B')
    store.getState().undo()
    store.getState().update(setName('C'))
    expect(store.getState().canRedo()).toBe(false)
  })

  it(`remembers at most ${MAX_HISTORY} steps`, () => {
    const store = createEditorStore(newResumeData('blank', 'onyx'), manualSaver().save)
    for (let i = 0; i <= MAX_HISTORY + 5; i++) store.getState().update(setName(`v${i}`))
    let undos = 0
    while (store.getState().canUndo()) {
      store.getState().undo()
      undos++
    }
    expect(undos).toBe(MAX_HISTORY)
  })

  it('does nothing for an edit that changes nothing', () => {
    const store = createEditorStore(newResumeData('blank', 'onyx'), manualSaver().save)
    store.getState().update(() => {})
    expect(store.getState().canUndo()).toBe(false)
    expect(store.getState().saveState).toBe('saved')
  })

  it('ignores edits, undo and redo while locked', () => {
    const { calls, save } = manualSaver()
    const store = createEditorStore(newResumeData('blank', 'onyx'), save)
    store.getState().update(setName('Ada'))
    store.getState().setLocked(true)
    store.getState().update(setName('Grace'))
    store.getState().undo()
    expect(store.getState().data.basics.name).toBe('Ada')
    expect(store.getState().locked).toBe(true)

    store.getState().setLocked(false)
    store.getState().update(setName('Grace'))
    expect(store.getState().data.basics.name).toBe('Grace')
    expect(calls).toHaveLength(0)
  })
})
