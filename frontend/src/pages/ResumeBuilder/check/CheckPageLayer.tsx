// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { FileSearch, ScanText, UserRound } from 'lucide-react'
import type { PdfAtsReport } from '@reactive-resume/resume/ats-pdf'
import { getPdfFindingMessage } from '@reactive-resume/web/features/ats-checker/messages'
import type { CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'
import { boxStyle, marginStyle, nodesOnPage, placeMarkers, type PageMap } from '../pageMap'
import { useBuilderView } from '../viewStore'
import { blocksMentioning } from './jobMatch'
import { useCheck } from './useCheck'
import { scrollToIssue } from './useCheckActions'

type PageSize = { width: number; height: number }

/**
 * Check's marks on one page: a numbered pin for each open issue, the exported PDF's findings while
 * the resume is unchanged, and a tint on the blocks that use the job-match term picked.
 */
export function CheckPageLayer({ pageIndex, pageMap }: { pageIndex: number; pageMap: PageMap }) {
  const check = useCheck()
  const tab = useBuilderView((s) => s.checkTab)
  const highlightTerm = useBuilderView((s) => s.highlightTerm)
  const exportCheck = useBuilderView((s) => s.exportCheck)
  const page = pageMap.pages[pageIndex]
  if (!page || page.width <= 0 || page.height <= 0) return null

  const tinted = tab === 'match' && highlightTerm ? blocksMentioning(check.data, highlightTerm).flatMap((target) => nodesOnPage(pageMap, pageIndex, target)) : []
  const exportFindings = tab === 'issues' && exportCheck?.data === check.data ? exportCheck.report : null
  return (
    <div className="pointer-events-none absolute inset-0">
      {tinted.map((node) => (
        <div key={`tint:${node.key}:${node.y}`} aria-hidden className="absolute -m-[3px] rounded-[3px] bg-amber-200/45 p-[3px] mix-blend-multiply" style={boxStyle(node, page)} />
      ))}
      {tab === 'issues' && <IssuePins issues={check.issues} pageMap={pageMap} pageIndex={pageIndex} page={page} />}
      {exportFindings && <ExportPins report={exportFindings} pageIndex={pageIndex} page={page} />}
    </div>
  )
}

function IssuePins({ issues, pageMap, pageIndex, page }: { issues: CheckIssue[]; pageMap: PageMap; pageIndex: number; page: PageSize }) {
  const selected = useBuilderView((s) => s.checkIssue)
  const pick = (issue: CheckIssue) => {
    useBuilderView.getState().setCheckIssue(issue.key)
    scrollToIssue(issue.key, 'panel')
  }
  return placeMarkers(issues, pageMap, pageIndex).map(({ item: issue, node, stack }) => {
    const isSelected = selected === issue.key
    return (
      <div key={issue.key}>
        <div aria-hidden className="absolute" style={boxStyle(node, page)}>
          <div className={`absolute -inset-x-1.5 -inset-y-[3px] rounded-[3px] outline-[1.5px] transition-[outline-color] outline-solid ${isSelected ? 'outline-warn' : 'outline-transparent'}`} />
          {stack === 0 && <div className="absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-[repeating-linear-gradient(90deg,var(--color-warn)_0_4px,transparent_4px_7px)]" />}
        </div>
        <button
          type="button"
          data-issue-pin={issue.key}
          aria-label={`Issue ${issue.number}: ${issue.title}`}
          aria-pressed={isSelected}
          onClick={() => pick(issue)}
          style={marginStyle(node, page, stack)}
          className={`pointer-events-auto absolute grid size-[22px] place-items-center rounded-full border-2 border-white bg-warn text-[11px] font-bold text-amber-950 shadow-md ${isSelected ? 'outline-2 outline-offset-1 outline-warn' : ''}`}
        >
          {issue.number}
        </button>
      </div>
    )
  })
}

/** The exported PDF's findings where they are in the file; its pages match the preview's. */
function ExportPins({ report, pageIndex, page }: { report: PdfAtsReport; pageIndex: number; page: PageSize }) {
  const openReport = () => useBuilderView.getState().setExportReportOpen(true)
  const onThisPage = [...report.findings, ...report.tips].flatMap((finding, index) => {
    const { page: pageNumber, box } = finding.evidence ?? {}
    return box && pageNumber === pageIndex + 1 ? [{ finding, box, key: `${finding.code}:${index}` }] : []
  })
  return onThisPage.map(({ finding, box, key }) => {
    const title = getPdfFindingMessage(finding.code).title
    return (
      <div key={key}>
        <div aria-hidden className="absolute -m-[3px] rounded-[3px] border-[1.5px] border-dashed border-info p-[3px]" style={boxStyle(box, page)} />
        <button
          type="button"
          aria-label={`Exported PDF: ${title}`}
          title={title}
          onClick={openReport}
          style={marginStyle(box, page)}
          className="pointer-events-auto absolute grid size-[22px] place-items-center rounded-full border-2 border-white bg-info text-void shadow-md"
        >
          <FileSearch size={12} />
        </button>
      </div>
    )
  })
}

/** "What a person sees / What a parser reads", over the page while Check is open. */
export function PageViewToggle() {
  const view = useBuilderView((s) => s.pageView)
  const setView = useBuilderView((s) => s.setPageView)
  const options = [
    { value: 'page', label: 'What a person sees', icon: UserRound },
    { value: 'parser', label: 'What a parser reads', icon: ScanText },
  ] as const
  return (
    <div role="radiogroup" aria-label="Page view" className="flex gap-0.5 rounded-xl border border-line bg-raised/90 p-0.5 shadow-lg backdrop-blur">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={view === value}
          onClick={() => setView(value)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${view === value ? 'bg-accent/25 text-ink shadow-[inset_0_0_0_1px_rgb(99_102_241/0.5)]' : 'text-ink-2 hover:text-ink'}`}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  )
}
