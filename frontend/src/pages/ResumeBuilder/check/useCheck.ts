// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useDeferredValue, useMemo } from 'react'
import { lintResumeForAts, type AtsReport } from '@reactive-resume/resume/ats'
import { buildIssues, type CheckIssue } from '@reactive-resume/web/features/resume/editor/check/issues'
import type { ResumeData } from '../../../lib/resumes/document'
import { useResume } from '../editorContext'

export type CheckResult = { data: ResumeData; report: AtsReport; issues: CheckIssue[] }

/** The live checks on the resume as it is now (deferred, so typing stays smooth), with numbered issues. */
export function useCheck(): CheckResult {
  const data = useDeferredValue(useResume())
  return useMemo(() => {
    const report = lintResumeForAts(data)
    return { data, report, issues: buildIssues(report, data) }
  }, [data])
}
