// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'
import { useEditWithUndo } from '../useEditWithUndo'
import { useBuilderView } from '../viewStore'
import { ignoreIssue, restoreIgnoredIssues } from './checkEdits'

/** Scrolls the page to an issue's pin, or the panel to its card. */
export function scrollToIssue(key: string, where: 'page' | 'panel') {
  const attribute = where === 'page' ? 'data-issue-pin' : 'data-issue-card'
  requestAnimationFrame(() => document.querySelector(`[${attribute}="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}

/** What an issue card can do: fix it, show it on the page, or set it aside. */
export function useCheckActions() {
  const editWithUndo = useEditWithUndo()
  const view = useBuilderView.getState

  const showOnPage = (issue: CheckIssue) => {
    view().setCheckIssue(issue.key)
    view().setPageView('page')
    scrollToIssue(issue.key, 'page')
  }

  // An issue fixed in one step is applied with undo; any other opens the field it's about.
  const fix = (issue: CheckIssue) => {
    view().setCheckIssue(null)
    if (issue.fix.kind === 'apply') editWithUndo(issue.fix.apply, `${issue.fix.done}. Issue resolved.`)
    else view().select({ ...issue.fix.target })
  }

  const ignore = (issue: CheckIssue) => {
    view().setCheckIssue(null)
    editWithUndo(ignoreIssue(issue.key), issue.keepLabel ? 'Kept as it is' : 'Issue ignored')
  }

  const restoreIgnored = () => editWithUndo(restoreIgnoredIssues, 'Ignored issues are back')

  return { showOnPage, fix, ignore, restoreIgnored }
}
