// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The name History gives a version made by accepting AI changes, read like a
// commit message: what was done, to which sections, for which job, by which model.

const VERBS: Record<string, string> = {
  resumeTailor: 'Tailored',
  resumeImprove: 'Improved',
  resumeReview: 'Rewrote',
  resumeImport: 'Tidied',
  letterDraft: 'Drafted',
}

export type CommitInfo = { task: string; sections: readonly string[]; job?: string; model: string }

/** "Tailored Summary, Experience · Senior Engineer at Acme · claude-opus-5-5". */
export function commitMessage({ task, sections, job, model }: CommitInfo): string {
  const what = `${VERBS[task] ?? 'Changed'} ${[...new Set(sections)].join(', ') || 'the document'}`
  return [what, job, model].filter(Boolean).join(' · ')
}
