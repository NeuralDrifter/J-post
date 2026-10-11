// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { lazy, Suspense, useState } from 'react'
import { FileSearch, LoaderCircle } from 'lucide-react'
import { Modal } from '../../../components/Modal'
import { errorMessage } from '../../../lib/api'
import type { ResumeData } from '../../../lib/resumes/document'
import { renderResumePdf } from '../../../lib/resumes/render'
import { toast } from '../../../lib/toast'
import { useBuilderView } from '../viewStore'

const AtsReportView = lazy(() => import('../../../components/AtsReportView'))

/** Renders the PDF that would be exported and runs the file-level check on it. Nothing leaves this computer. */
async function checkExportedPdf(data: ResumeData) {
  const [{ runAtsCheck, blobToPdfFile }, pdf] = await Promise.all([import('@reactive-resume/web/features/ats-checker/run-ats-check'), renderResumePdf(data)])
  return (await runAtsCheck(blobToPdfFile(pdf, 'resume.pdf'))).report
}

/** "Also check the exported PDF": its findings are pinned to the page, and its report opens from the toast. */
export function ExportCheck({ data }: { data: ResumeData }) {
  const [running, setRunning] = useState(false)
  const report = useBuilderView((s) => s.exportCheck?.report ?? null)
  const reportOpen = useBuilderView((s) => s.exportReportOpen)
  const { setExportCheck, setExportReportOpen } = useBuilderView.getState()

  const run = async () => {
    setRunning(true)
    try {
      const result = await checkExportedPdf(data)
      setExportCheck({ report: result, data })
      const problems = result.findings.length
      if (problems === 0) toast.success('Exported PDF checked: it reads cleanly too.')
      else toast.info(`Exported PDF checked: ${problems} more to look at.`, { label: 'Show', onClick: () => setExportReportOpen(true) })
    } catch (err) {
      toast.error(`The exported PDF couldn't be checked: ${errorMessage(err)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost w-full py-1.5 text-xs" disabled={running} onClick={run}>
        {running ? <LoaderCircle size={14} className="animate-spin" /> : <FileSearch size={14} />}
        {running ? 'Checking the exported PDF…' : 'Also check the exported PDF'}
      </button>
      {reportOpen && report && (
        <Modal title="The exported PDF" onClose={() => setExportReportOpen(false)} width="max-w-2xl">
          <p className="mb-4 text-sm text-ink-2">What the file-level check found in the PDF you'd send. It ran on this computer; nothing was uploaded.</p>
          <Suspense fallback={<LoaderCircle size={18} className="animate-spin text-ink-3" />}>
            <AtsReportView report={report} />
          </Suspense>
        </Modal>
      )}
    </>
  )
}
