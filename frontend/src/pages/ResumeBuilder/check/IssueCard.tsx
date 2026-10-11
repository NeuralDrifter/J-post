// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { MouseEvent } from 'react'
import { ArrowRight, Columns2, EyeOff, Heading, Link, Pencil, Plus, Rows3, SlidersHorizontal, Type, Wrench, type LucideIcon } from 'lucide-react'
import { getCategoryName, type CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'
import { useBuilderView } from '../viewStore'
import { useCheckActions } from './useCheckActions'

/** Reactive Resume names its fix icons after Material Symbols; these are the lucide equivalents. */
const FIX_ICONS: Record<string, LucideIcon> = {
  link: Link,
  visibility_off: EyeOff,
  add: Plus,
  title: Heading,
  view_list: Rows3,
  arrow_forward: ArrowRight,
  format_size: Type,
  tune: SlidersHorizontal,
  view_column: Columns2,
}

/** A numbered card: category, title, a plain explanation, the fix, Show on page and Ignore (or Keep). */
export function IssueCard({ issue, selected }: { issue: CheckIssue; selected: boolean }) {
  const { fix, ignore, showOnPage } = useCheckActions()
  const pick = useBuilderView((s) => s.setCheckIssue)
  const applies = issue.fix.kind === 'apply'
  const FixIcon = issue.fix.kind === 'apply' ? (FIX_ICONS[issue.fix.icon] ?? Wrench) : Pencil
  const act = (action: (issue: CheckIssue) => void) => (e: MouseEvent) => {
    e.stopPropagation()
    action(issue)
  }

  return (
    // Clicking a card outlines its block on the page; Show on page does the same from the keyboard.
    <li
      data-issue-card={issue.key}
      onClick={() => pick(issue.key)}
      className={`cursor-pointer space-y-2.5 rounded-2xl border bg-panel/70 p-3 transition ${selected ? 'border-warn/70 shadow-[0_0_24px_-8px_rgb(245_158_11/0.5)]' : 'border-line hover:border-line-strong'}`}
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-full bg-warn text-[11px] font-bold text-amber-950">
          {issue.number}
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="label-mono">{getCategoryName(issue.category)}</p>
          <h3 className="text-sm font-semibold">
            <span className="sr-only">Issue {issue.number}: </span>
            {issue.title}
          </h3>
          <p className="text-xs text-ink-2">{issue.body}</p>
        </div>
      </div>
      <div className="ml-8 flex flex-wrap gap-1.5">
        <button type="button" className={`btn ${applies ? 'btn-primary' : 'btn-ghost'} py-1 text-xs`} onClick={act(fix)}>
          <FixIcon size={13} /> {issue.fix.label}
        </button>
        {issue.target && (
          <button type="button" className="btn btn-ghost py-1 text-xs" onClick={act(showOnPage)}>
            Show on page
          </button>
        )}
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={act(ignore)}>
          {issue.keepLabel ? 'Keep' : 'Ignore'}
        </button>
      </div>
    </li>
  )
}
