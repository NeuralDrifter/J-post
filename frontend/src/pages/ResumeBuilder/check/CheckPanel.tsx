// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Check: how reliably software reads the resume, live as it's edited, and
// how it covers a job posting. What it shows follows Reactive Resume's Check
// panel (MIT); the screens are Job Track's.
import { useState, type CSSProperties } from 'react'
import { ChevronDown, CircleAlert, CircleCheck, Zap } from 'lucide-react'
import { ATS_CATEGORIES, type AtsCategory, type AtsReport } from '@reactive-resume/resume/ats'
import { getCategoryDescription, getCategoryName } from '@reactive-resume/web/features/resume/editor/check/issues'
import type { app } from '../../../lib/backend'
import { Segmented } from '../ui/controls'
import { useBuilderView, type CheckTab } from '../viewStore'
import { ExportCheck } from './ExportCheck'
import { IssueCard } from './IssueCard'
import { JobMatchTab } from './JobMatchTab'
import { useCheck, type CheckResult } from './useCheck'
import { useCheckActions } from './useCheckActions'
import { WritingTab } from './WritingTab'

/** Scores at or above this read cleanly. */
const CLEAN_SCORE = 80

export function CheckPanel({ doc }: { doc: app.Document }) {
  const check = useCheck()
  const tab = useBuilderView((s) => s.checkTab)
  const setTab = useBuilderView((s) => s.setCheckTab)
  const tabs: { value: CheckTab; label: string }[] = [
    { value: 'issues', label: `Issues · ${check.issues.length}` },
    { value: 'match', label: 'Job match' },
    { value: 'writing', label: 'Writing' },
  ]
  return (
    <div className="space-y-3">
      <ScoreSummary report={check.report} />
      <Segmented label="Check views" options={tabs} value={tab} onChange={setTab} />
      {tab === 'match' ? <JobMatchTab doc={doc} data={check.data} /> : tab === 'writing' ? <WritingTab doc={doc} /> : <IssuesTab check={check} />}
    </div>
  )
}

const verdict = (score: number) => (score >= CLEAN_SCORE ? 'Reads cleanly' : score >= 50 ? 'Mostly readable' : 'Hard for software to read')

function ScoreSummary({ report }: { report: AtsReport }) {
  const { score, passedRules, totalRules } = report
  const open = report.findings.length
  const ring = { background: `conic-gradient(${score >= CLEAN_SCORE ? 'var(--color-accent)' : 'var(--color-warn)'} ${score}%, rgb(255 255 255 / 0.08) 0)` } as CSSProperties
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-4">
      <div role="img" aria-label={`Readability score: ${score} out of 100`} className="grid size-[76px] shrink-0 place-items-center rounded-full" style={ring}>
        <span className="grid size-[62px] place-items-center rounded-full bg-panel font-mono text-2xl font-bold">{score}</span>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold">{verdict(score)}</p>
        <p className="text-xs text-ink-2">
          {passedRules} of {totalRules} checks pass. {open > 0 ? `${open} thing${open === 1 ? '' : 's'} to review.` : 'Nothing to review.'}
        </p>
        <p className="flex items-center gap-1 text-[11px] text-ink-3">
          <Zap size={12} /> Live · updates as you edit
        </p>
      </div>
    </div>
  )
}

function IssuesTab({ check }: { check: CheckResult }) {
  const { report, issues, data } = check
  const selected = useBuilderView((s) => s.checkIssue)
  const { restoreIgnored } = useCheckActions()
  const ignored = report.ignored.length
  return (
    <div className="space-y-2.5">
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-emerald-200">
          <CircleCheck size={16} className="shrink-0" /> <span><strong>Nothing to fix.</strong> Every check passes.</span>
        </p>
      ) : (
        <ol aria-label="Issues" className="space-y-2.5">
          {issues.map((issue) => (
            <IssueCard key={issue.key} issue={issue} selected={selected === issue.key} />
          ))}
        </ol>
      )}
      <CategoryRows report={report} />
      <p className="px-1 text-[11px] text-ink-3">
        The score counts how reliably software reads your resume, not whether you'll be shortlisted.{' '}
        {ignored > 0 && (
          <>
            {ignored} issue{ignored === 1 ? ' is' : 's are'} ignored.{' '}
            <button type="button" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink" onClick={restoreIgnored}>
              Show them again
            </button>
          </>
        )}
      </p>
      <ExportCheck data={data} />
    </div>
  )
}

/** Each category's checks, "n of m"; categories with something to review start open. */
function CategoryRows({ report }: { report: AtsReport }) {
  const [toggled, setToggled] = useState<Partial<Record<AtsCategory, boolean>>>({})
  const categories = ATS_CATEGORIES.filter((category) => report.categories[category].total > 0)
  return (
    <section aria-label="Checks by category" className="glass overflow-hidden rounded-2xl">
      {categories.map((category, index) => {
        const { total, passed } = report.categories[category]
        const failing = total - passed
        const open = toggled[category] ?? failing > 0
        const Icon = failing > 0 ? CircleAlert : CircleCheck
        return (
          <div key={category} className={index > 0 ? 'border-t border-line' : ''}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setToggled((current) => ({ ...current, [category]: !open }))}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/[0.03]"
            >
              <Icon size={15} className={failing > 0 ? 'text-amber-300' : 'text-emerald-300'} />
              <span className="font-medium">{getCategoryName(category)}</span>
              <span className={`text-xs ${failing > 0 ? 'text-amber-300' : 'text-ink-3'}`}>{failing > 0 ? `${failing} to review` : `${passed} of ${total}`}</span>
              <ChevronDown size={14} className={`ml-auto text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <p className="px-3 pb-2.5 pl-[34px] text-xs text-ink-2">{getCategoryDescription(category)}</p>}
          </div>
        )
      })}
    </section>
  )
}
