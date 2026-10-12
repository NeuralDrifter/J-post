// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// An ATS report in Job Track's style. What it shows follows Reactive Resume's
// report (apps/web/src/features/ats-checker/report, MIT); the words come from
// its messages.ts.
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertOctagon, AlertTriangle, Lightbulb, Wrench, type LucideIcon } from 'lucide-react'
import type { PdfFinding, PdfSeverity } from '@reactive-resume/resume/ats-pdf'
import { getPdfCategoryDescription, getPdfCategoryLabel, getPdfFindingMessage } from '@reactive-resume/web/features/ats-checker/messages'
import { Chip } from './Chip'
import { builderCheckPath, CHECK_MATCH } from '../lib/resumes/paths'
import { matchBand } from '../lib/match'
import type { PdfAtsReport } from '../lib/resumes/atsCheck'

const SCORE_TONE: Record<string, string> = { good: 'text-emerald-300', fair: 'text-amber-300', low: 'text-rose-300' }
const BAR_TONE: Record<string, string> = { good: 'bg-success', fair: 'bg-warn', low: 'bg-danger' }

const SEVERITY_GROUPS: { severity: PdfSeverity; title: string; icon: LucideIcon; tone: string }[] = [
  { severity: 'blocker', title: 'Blockers', icon: AlertOctagon, tone: 'text-rose-300' },
  { severity: 'warning', title: 'Warnings', icon: AlertTriangle, tone: 'text-amber-300' },
  { severity: 'tip', title: 'Tips (not scored)', icon: Lightbulb, tone: 'text-cyan-300' },
]

/**
 * Where a finding gets fixed: in the builder for a resume from the library (`jobId` adds Job match for the posting),
 * or by importing a PDF that came from elsewhere.
 */
export type ReportFix = { kind: 'builder'; resumeId: string; jobId?: string } | { kind: 'import' }

export default function AtsReportView({ report, fix }: { report: PdfAtsReport; fix?: ReportFix }) {
  return (
    <div className="space-y-5">
      <ScoreHeader report={report} />
      <Categories report={report} />
      {report.jd && <KeywordCoverage jd={report.jd} />}
      {report.jd && fix?.kind === 'builder' && fix.jobId && <FixLink to={builderCheckPath(fix.resumeId, CHECK_MATCH, fix.jobId)}>Work on keywords in the builder</FixLink>}
      {SEVERITY_GROUPS.map((group) => (
        <FindingGroup key={group.severity} {...group} fix={fix} findings={group.severity === 'tip' ? report.tips : report.findings.filter((f) => f.severity === group.severity)} />
      ))}
      <p className="font-mono text-[11px] text-ink-3">
        {report.passedChecks} of {report.applicableChecks} checks passed{report.skippedChecks > 0 && `, ${report.skippedChecks} couldn't run on this file`} · {report.document.pageCount}{' '}
        page{report.document.pageCount === 1 ? '' : 's'}, {report.document.wordCount} words
      </p>
    </div>
  )
}

function ScoreHeader({ report }: { report: PdfAtsReport }) {
  const capped = report.cappedBy.map((code) => getPdfFindingMessage(code).title)
  return (
    <div className="flex items-center gap-4">
      <p className={`font-mono text-5xl font-bold ${SCORE_TONE[matchBand(report.score)]}`}>{report.score}</p>
      <div className="min-w-0 text-sm text-ink-2">
        <p>How cleanly applicant tracking systems can read this file, out of 100.</p>
        {capped.length > 0 && <p className="mt-1 text-xs text-rose-300">Held down by: {capped.join(' ')}</p>}
      </div>
    </div>
  )
}

function Categories({ report }: { report: PdfAtsReport }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {report.categories.map((c) => (
        <li key={c.category} title={getPdfCategoryDescription(c.category)}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{getPdfCategoryLabel(c.category)}</span>
            <span className="font-mono text-xs text-ink-2">{c.score}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${BAR_TONE[matchBand(c.score)]}`} style={{ width: `${c.score}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function KeywordCoverage({ jd }: { jd: NonNullable<PdfAtsReport['jd']> }) {
  const coverage = Math.round(jd.weightedCoverage * 100)
  return (
    <section className="space-y-2">
      <h4 className="label-mono">Job description keywords</h4>
      <p className="text-sm text-ink-2">
        The resume uses {jd.matchedCount} of the posting's {jd.totalTerms} key terms ({coverage}% by weight).
      </p>
      <TermChips terms={jd.matchedTerms} tone="success" />
      {jd.missingTerms.length > 0 && (
        <>
          <p className="text-xs text-ink-3">Missing, if they're true for you:</p>
          <TermChips terms={jd.missingTerms} tone="warn" />
        </>
      )}
      {jd.stuffedTerms.length > 0 && <p className="text-xs text-amber-300">Used far more often than the posting uses them: {jd.stuffedTerms.join(', ')}.</p>}
      {jd.documentHasHiddenText && <p className="text-xs text-amber-300">This file has text a reader can't see, so some matches may be against hidden text.</p>}
    </section>
  )
}

function TermChips({ terms, tone }: { terms: readonly string[]; tone: 'success' | 'warn' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {terms.map((term) => (
        <Chip key={term} tone={tone}>
          {term}
        </Chip>
      ))}
    </div>
  )
}

type GroupProps = { title: string; icon: LucideIcon; tone: string; findings: readonly PdfFinding[]; fix?: ReportFix }

function FindingGroup({ title, icon: Icon, tone, findings, fix }: GroupProps) {
  if (findings.length === 0) return null
  return (
    <section className="space-y-2">
      <h4 className={`label-mono flex items-center gap-1.5 ${tone}`}>
        <Icon size={12} /> {title} <span className="text-ink-3">{findings.length}</span>
      </h4>
      <ul className="space-y-2">
        {findings.map((finding, i) => (
          <FindingRow key={`${finding.code}-${i}`} finding={finding} fix={fix} />
        ))}
      </ul>
    </section>
  )
}

function FindingRow({ finding, fix }: { finding: PdfFinding; fix?: ReportFix }) {
  const { title, action } = getPdfFindingMessage(finding.code)
  return (
    <li className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-ink-2">{action}</p>
      {finding.evidence?.snippet && (
        <p className="mt-1 truncate font-mono text-[11px] text-ink-3" title={finding.evidence.snippet}>
          “{finding.evidence.snippet}”{finding.evidence.page ? ` · page ${finding.evidence.page}` : ''}
        </p>
      )}
      {fix?.kind === 'builder' && <FixLink to={builderCheckPath(fix.resumeId, finding.category)}>Fix in builder</FixLink>}
      {fix?.kind === 'import' && <FixLink to="/resumes?import=1">Import this PDF to fix it</FixLink>}
    </li>
  )
}

function FixLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-indigo-200">
      <Wrench size={12} /> {children}
    </Link>
  )
}
