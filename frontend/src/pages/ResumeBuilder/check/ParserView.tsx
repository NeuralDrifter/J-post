// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'
import { useBuilderView } from '../viewStore'
import { groupLines, issueOnLine, parsedFields, parsePdf, type ParsedPdf } from './parsedPdf'
import { useCheck } from './useCheck'

type Parse = { version: number; parsed: ParsedPdf | null }

/** "What a parser reads": the text of the PDF on the page, in reading order, with what a parser recognises in it. */
export function ParserView() {
  const parse = useParsedRender()
  const { issues } = useCheck()
  return (
    <div className="mx-auto w-[612px] max-w-full space-y-4 rounded-2xl border border-line bg-panel/90 px-8 py-7 font-mono text-xs leading-5 shadow-2xl max-sm:px-4">
      {!parse ? (
        <p className="flex items-center gap-2 font-sans text-sm text-ink-2">
          <LoaderCircle size={14} className="animate-spin" /> Reading the PDF…
        </p>
      ) : !parse.parsed ? (
        <p className="font-sans text-sm text-rose-300">The page's PDF couldn't be read. Edit anything to render it again.</p>
      ) : (
        <ParsedText parsed={parse.parsed} issues={issues} />
      )}
    </div>
  )
}

/** Parses each new render of the page; a parse of an older render is dropped. */
function useParsedRender(): Parse | undefined {
  const rendered = useBuilderView((s) => s.rendered)
  const [parse, setParse] = useState<Parse>()
  useEffect(() => {
    if (!rendered.file) return
    let current = true
    parsePdf(rendered.file).then(
      (parsed) => current && setParse({ version: rendered.version, parsed }),
      () => current && setParse({ version: rendered.version, parsed: null }),
    )
    return () => {
      current = false
    }
  }, [rendered])
  return parse
}

function ParsedText({ parsed, issues }: { parsed: ParsedPdf; issues: readonly CheckIssue[] }) {
  if (parsed.doc.charCount === 0) return <p className="font-sans text-sm text-amber-300">This PDF has no text layer, so a parser reads nothing from it.</p>
  const columns = parsed.doc.pages.some((page) => page.gutter) ? 2 : 1
  return (
    <>
      <p className="flex flex-wrap justify-between gap-2 text-[10px] font-medium text-ink-3 uppercase">
        <span>Extracted from the PDF on the page · reading order</span>
        <span>
          text layer ✓ · {columns} column{columns === 1 ? '' : 's'}
        </span>
      </p>
      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-1">
        {parsedFields(parsed, issues).map((field) => (
          <div key={field.id} className="contents">
            <dt className="text-ink-3 uppercase">{field.label}</dt>
            <dd className={`flex min-w-0 items-center gap-2 ${field.issue || !field.value ? 'text-amber-300' : ''}`}>
              <span className="min-w-0 break-words">{field.value || 'not found'}</span>
              {field.issue && <IssueChip issue={field.issue} />}
            </dd>
          </div>
        ))}
      </dl>
      <hr className="border-line" />
      {groupLines(parsed).map((group, index) => (
        <section key={`${index}:${group.heading ?? ''}`} className="space-y-0.5">
          {group.heading !== null && <h3 className="text-indigo-300">▸ {group.heading.toUpperCase()}</h3>}
          {group.lines.map((line, lineIndex) => {
            const issue = issueOnLine(issues, line)
            return (
              <p key={`${lineIndex}:${line}`} className={`flex items-start gap-2 pl-3.5 ${issue ? 'text-amber-300' : 'text-ink-2'}`}>
                <span className="min-w-0 break-words">{line}</span>
                {issue && <IssueChip issue={issue} />}
              </p>
            )
          })}
        </section>
      ))}
    </>
  )
}

function IssueChip({ issue }: { issue: CheckIssue }) {
  return <span className="shrink-0 rounded-full bg-warn/20 px-1.5 font-sans text-[10px] leading-[18px] font-semibold whitespace-nowrap text-amber-200">issue {issue.number}</span>
}
