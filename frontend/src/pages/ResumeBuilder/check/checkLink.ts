// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'
import { CHECK_MATCH } from '../../../lib/resumes/paths'
import type { CheckTab } from '../viewStore'

/** What `?check=` opens: Job match, or Issues with the first issue of that category picked (none if it has none). */
export function checkLinkTarget(check: string, issues: readonly Pick<CheckIssue, 'key' | 'category'>[]): { tab: CheckTab; issueKey: string | null } {
  if (check === CHECK_MATCH) return { tab: 'match', issueKey: null }
  return { tab: 'issues', issueKey: issues.find((issue) => issue.category === check)?.key ?? null }
}
