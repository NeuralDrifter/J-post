// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { AI_TASKS } from '../../../generated/choices'

type TaskId = (typeof AI_TASKS)[number]['id']

/** The resume and letter AI tasks, by what they do (ids as Settings stores them). */
export const SETTINGS_TASK = {
  tailor: 'resumeTailor',
  improve: 'resumeImprove',
  review: 'resumeReview',
  tidyImport: 'resumeImport',
  letter: 'letterDraft',
} as const satisfies Record<string, TaskId>
