// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { create } from 'zustand'
import { errorMessage } from '../../../lib/api'
import { ListAIGenerations, ListJobSummaries, RunResumeAI, SetAIGenerationDecisions, type app } from '../../../lib/backend'
import { isNeedsResume, needsResumeText, requestNeedsResume } from '../../../lib/needsResume'
import type { Decision, Decisions } from '../../../lib/resumes/ai/changes'
import { parseDecisions } from '../../../lib/resumes/ai/changes'

/**
 * The open document's AI runs: every generation kept with it, the version picked per section, and the runs in
 * progress. A run's error stays with what started it (a section, a panel), keyed like the run.
 */
type AIReviewState = {
  docId: string
  generations: app.AIGeneration[]
  /** "Position at Company" by job id, for commit messages and labels. */
  jobs: Record<string, string>
  picked: Record<string, string>
  running: Record<string, boolean>
  errors: Record<string, string>
  load: (docId: string) => Promise<void>
  /** Runs a task; resolves to the new generation, or undefined (the error is kept under `key`). */
  run: (key: string, request: app.ResumeAIRequest) => Promise<app.AIGeneration | undefined>
  /** Records decisions for some of a run's changes; null clears one (back to waiting). */
  decide: (generationId: string, decisions: Record<string, Decision | null>) => Promise<boolean>
  pick: (sectionId: string, generationId: string) => void
  clearError: (key: string) => void
  reset: () => void
}

const initial = { docId: '', generations: [], jobs: {}, picked: {}, running: {}, errors: {} }

export const useAIReview = create<AIReviewState>()((set, get) => ({
  ...initial,
  load: async (docId) => {
    set({ ...initial, docId })
    const [generations, summaries] = await Promise.all([ListAIGenerations(docId).catch(() => []), ListJobSummaries().catch(() => [])])
    if (get().docId !== docId) return
    const jobs = Object.fromEntries(summaries.map((s) => [s.job.id, `${s.job.position} at ${s.job.company}`]))
    set({ generations, jobs })
  },
  run: async (key, request) => {
    set((s) => ({ running: { ...s.running, [key]: true }, errors: without(s.errors, key) }))
    try {
      const gen = await RunResumeAI(request)
      if (get().docId === request.documentId) set((s) => ({ generations: [...s.generations, gen], picked: {} }))
      return gen
    } catch (err) {
      const message = errorMessage(err)
      if (isNeedsResume(message)) requestNeedsResume()
      set((s) => ({ errors: { ...s.errors, [key]: isNeedsResume(message) ? needsResumeText(message) : message } }))
      return undefined
    } finally {
      set((s) => ({ running: without(s.running, key) }))
    }
  },
  decide: async (generationId, changes) => {
    const gen = get().generations.find((g) => g.id === generationId)
    if (!gen) return false
    const decisions = mergeDecisions(parseDecisions(gen.decisions), changes)
    try {
      await SetAIGenerationDecisions(generationId, JSON.stringify(decisions))
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, [generationId]: errorMessage(err) } }))
      return false
    }
    set((s) => ({ generations: s.generations.map((g) => (g.id === generationId ? { ...g, decisions: JSON.stringify(decisions) } : g)) }))
    return true
  },
  pick: (sectionId, generationId) => set((s) => ({ picked: { ...s.picked, [sectionId]: generationId } })),
  clearError: (key) => set((s) => ({ errors: without(s.errors, key) })),
  reset: () => set(initial),
}))

function without<V>(record: Record<string, V>, key: string): Record<string, V> {
  const next = { ...record }
  delete next[key]
  return next
}

export function mergeDecisions(current: Decisions, changes: Record<string, Decision | null>): Record<string, Decision> {
  const next: Record<string, Decision> = { ...current }
  for (const [key, decision] of Object.entries(changes)) {
    if (decision) next[key] = decision
    else delete next[key]
  }
  return next
}

/** Has anything from this run been accepted yet? The first accept keeps a "Before AI edit" version. */
export const anyAccepted = (gen: app.AIGeneration) => Object.values(parseDecisions(gen.decisions)).includes('accepted')
