// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// "What a parser reads": the rendered PDF's text in reading order and the
// fields a parser recognises in it, tied to the open Check issues. Follows
// Reactive Resume's parser view (MIT).
import type { AtsRuleCode } from '@reactive-resume/resume/ats'
import type { ExtractedDocument, ResumeSemantics } from '@reactive-resume/resume/ats-pdf'
import type { CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'

export type ParsedPdf = { doc: ExtractedDocument; semantics: ResumeSemantics }

/** Reads a PDF the way a parser does. The pass for hidden text and images of text belongs to the full check, so it's skipped. */
export async function parsePdf(pdf: Blob): Promise<ParsedPdf> {
  const [{ extractPdf }, { blobToPdfFile }, engine] = await Promise.all([
    import('@reactive-resume/web/features/ats-checker/extract-client'),
    import('@reactive-resume/web/features/ats-checker/run-ats-check'),
    import('@reactive-resume/resume/ats-pdf'),
  ])
  const raw = await extractPdf(blobToPdfFile(pdf, 'resume.pdf'), { operatorBudgetMs: 0 })
  const doc = engine.buildExtractedDocument(raw)
  return { doc, semantics: engine.buildResumeSemantics(raw, doc, { now: new Date() }) }
}

export type ParsedField = { id: string; label: string; value: string; issue: CheckIssue | undefined }

/** Which live checks each recognised field reflects. */
const FIELD_CODES: Record<string, readonly AtsRuleCode[]> = {
  name: ['MISSING_NAME'],
  email: ['MISSING_EMAIL', 'MALFORMED_EMAIL'],
  phone: ['MISSING_PHONE'],
  location: ['MISSING_LOCATION'],
  links: ['MALFORMED_URL'],
  sections: ['NON_STANDARD_SECTION_TITLE', 'NO_VISIBLE_EXPERIENCE', 'SECTION_MISSING_FROM_LAYOUT'],
  dates: ['EMPTY_PERIOD', 'UNPARSEABLE_PERIOD', 'UNPARSEABLE_DATE', 'REVERSED_PERIOD', 'FUTURE_DATED_PERIOD'],
}

/** The fields a parser found: name, contact details, links, headings and dates, each with the issue behind it. */
export function parsedFields({ semantics }: ParsedPdf, issues: readonly CheckIssue[]): ParsedField[] {
  const { contact } = semantics
  const links = [...new Set([...contact.textUrls, ...contact.annotationUrls])]
  const fields = [
    { id: 'name', label: 'Name', value: contact.nameLine ?? '' },
    { id: 'email', label: 'Email', value: contact.emails.join(', ') },
    { id: 'phone', label: 'Phone', value: contact.phones.join(', ') },
    { id: 'location', label: 'Location', value: contact.locationLine ?? '' },
    { id: 'links', label: 'Links', value: links.join(', ') },
    { id: 'sections', label: 'Sections', value: semantics.headings.map((h) => h.text).join(', ') },
    { id: 'dates', label: 'Dates', value: datesSummary(semantics) },
  ]
  return fields.map((field) => ({ ...field, issue: issues.find((issue) => FIELD_CODES[field.id]?.includes(issue.finding.code)) }))
}

function datesSummary({ dates }: ResumeSemantics): string {
  if (dates.length === 0) return ''
  const unreadable = dates.filter((date) => !date.parsed).length
  return unreadable > 0 ? `${dates.length} found, ${unreadable} unreadable` : `${dates.length} found`
}

export type LineGroup = { heading: string | null; lines: string[] }

/** The lines in reading order, grouped under the headings a parser recognised. */
export function groupLines({ doc, semantics }: ParsedPdf): LineGroup[] {
  const headingAt = new Map(semantics.headings.map((h) => [h.lineIndex, h.text]))
  const groups: LineGroup[] = [{ heading: null, lines: [] }]
  doc.lines.forEach((line, index) => {
    const heading = headingAt.get(index)
    if (heading !== undefined) groups.push({ heading, lines: [] })
    else groups.at(-1)?.lines.push(line.text)
  })
  return groups.filter((group) => group.heading !== null || group.lines.length > 0)
}

/** The issue whose text shows on a line, such as a link written without https:// or an unreadable date. */
export function issueOnLine(issues: readonly CheckIssue[], line: string): CheckIssue | undefined {
  return issues.find((issue) => {
    const value = issue.finding.params?.value
    return typeof value === 'string' && value.length > 2 && line.includes(value)
  })
}
