// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { lazy, Suspense, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, FileText, FileUp, LoaderCircle, RotateCcw, ScanText, X } from 'lucide-react'
import { PageTitle } from '../../components/PageTitle'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import { ListDocuments, type app } from '../../lib/backend'
import {
  atsErrorMessage,
  renderDocumentToPdfFile,
  runStandaloneAtsCheck,
  type PdfAtsReport,
} from '../../lib/resumes/atsCheck'
import { RESUME_KIND } from '../../lib/resumes/paths'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import type { ReportFix } from '../../components/AtsReportView'

const AtsReportView = lazy(() => import('../../components/AtsReportView'))

type SourceMode = 'upload' | 'library'

// Ephemeral visit-only cache: retained while the app runs, without touching the database.
type VisitState = {
  report: PdfAtsReport | null
  sourceLabel: string
  /** Where the report's findings get fixed: the builder for a library resume, an import for a file. */
  fix?: ReportFix
  jobDescription: string
}

let visitCache: VisitState = {
  report: null,
  sourceLabel: '',
  jobDescription: '',
}

export default function AtsCheckerPage() {
  const { data: resumes } = useLoad(() => api(ListDocuments(RESUME_KIND, false)), [])
  const [mode, setMode] = useState<SourceMode>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [selectedResumeId, setSelectedResumeId] = useState<string>('')
  const [jobDescription, setJobDescription] = useState(visitCache.jobDescription)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<PdfAtsReport | null>(visitCache.report)
  const [sourceLabel, setSourceLabel] = useState(visitCache.sourceLabel)
  const [fix, setFix] = useState(visitCache.fix)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onFileSelected = (selected: File | null) => {
    if (!selected) return
    if (!/\.pdf$/i.test(selected.name) && selected.type !== 'application/pdf') {
      toast.error('Please choose a PDF file.')
      return
    }
    setFile(selected)
    setErrorMessage(null)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onFileSelected(dropped)
  }

  const run = async () => {
    setErrorMessage(null)
    setRunning(true)

    try {
      let targetFile: File
      let label: string
      let fixIn: ReportFix

      if (mode === 'upload') {
        if (!file) {
          toast.error('Choose a PDF file to check.')
          setRunning(false)
          return
        }
        targetFile = file
        label = file.name
        fixIn = { kind: 'import' }
      } else {
        const resume = resumes?.find((r) => r.id === selectedResumeId)
        if (!resume) {
          toast.error('Select a resume to check.')
          setRunning(false)
          return
        }
        label = resume.name
        fixIn = { kind: 'builder', resumeId: resume.id }
        targetFile = await renderDocumentToPdfFile(resume.id, resume.name)
      }

      const generatedReport = await runStandaloneAtsCheck(targetFile, jobDescription)
      setReport(generatedReport)
      setSourceLabel(label)
      setFix(fixIn)
      visitCache = {
        report: generatedReport,
        sourceLabel: label,
        fix: fixIn,
        jobDescription,
      }
    } catch (err) {
      const msg = atsErrorMessage(err)
      setErrorMessage(msg)
      toast.error(msg)
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    setReport(null)
    setSourceLabel('')
    setFile(null)
    setErrorMessage(null)
    visitCache = {
      report: null,
      sourceLabel: '',
      jobDescription,
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/resumes" className="flex w-fit items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft size={13} /> Resumes
      </Link>

      <PageTitle
        title="ATS checker"
        subtitle="Test any PDF resume against applicant tracking systems and optional job description keywords."
      >
        {report && (
          <button type="button" className="btn btn-ghost py-1 text-xs" onClick={reset}>
            <RotateCcw size={14} /> Clear result
          </button>
        )}
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Source and options */}
        <div className="space-y-4 lg:col-span-5">
          <Panel title="Resume source">
            {mode === 'upload' ? (
              <div className="space-y-3">
                {file ? (
                  <div className="flex items-center justify-between rounded-xl border border-line bg-white/[0.03] p-3 text-sm">
                    <div className="flex items-center gap-2.5 truncate">
                      <FileText size={18} className="shrink-0 text-accent" />
                      <div className="truncate">
                        <p className="truncate font-medium">{file.name}</p>
                        <p className="text-[11px] text-ink-3">{(file.size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost p-1 text-ink-3 hover:text-rose-300"
                      onClick={() => setFile(null)}
                      title="Remove file"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                      isDragging ? 'border-accent bg-accent/5' : 'border-line hover:border-ink-3 hover:bg-white/[0.02]'
                    }`}
                  >
                    <FileUp size={28} className="mb-2 text-ink-3" />
                    <p className="text-sm font-medium">Drop a PDF here or click to browse</p>
                    <p className="mt-1 text-xs text-ink-3">Supports any standard PDF resume up to 25 MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                    />
                  </div>
                )}

                <div className="pt-1">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() => {
                      setMode('library')
                      if (!selectedResumeId && resumes && resumes.length > 0) {
                        setSelectedResumeId(resumes[0].id)
                      }
                    }}
                  >
                    Check one of my resumes instead
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-ink-2">Select resume from library</label>
                <select
                  className="field w-full py-2 text-xs"
                  value={selectedResumeId}
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                >
                  {(!resumes || resumes.length === 0) && <option value="">No saved resumes found</option>}
                  {resumes?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <div className="pt-1">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() => setMode('upload')}
                  >
                    Upload an external PDF instead
                  </button>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Job description (optional)">
            <p className="mb-2 text-xs text-ink-3">
              Paste the target job posting to analyze keyword coverage and term weighting alongside layout and parsing checks.
            </p>
            <textarea
              className="field h-36 w-full resize-y text-xs leading-relaxed"
              placeholder="Paste job posting text here…"
              value={jobDescription}
              onChange={(e) => {
                setJobDescription(e.target.value)
                visitCache.jobDescription = e.target.value
              }}
            />

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn btn-primary w-full py-2 text-xs sm:w-auto"
                onClick={run}
                disabled={running || (mode === 'upload' ? !file : !selectedResumeId)}
              >
                {running ? (
                  <>
                    <LoaderCircle size={15} className="animate-spin" /> Checking…
                  </>
                ) : (
                  <>
                    <ScanText size={15} /> Run check
                  </>
                )}
              </button>
            </div>
          </Panel>
        </div>

        {/* Results */}
        <div className="lg:col-span-7">
          <Panel title={report ? `ATS report: ${sourceLabel}` : 'ATS report'}>
            {errorMessage && (
              <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                <p className="font-semibold">Unable to run check</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            )}

            {running ? (
              <div className="grid min-h-64 place-items-center py-12 text-center">
                <div>
                  <LoaderCircle size={32} className="mx-auto mb-3 animate-spin text-accent" />
                  <p className="text-sm font-medium">Analyzing PDF structure and text layer…</p>
                  <p className="mt-1 text-xs text-ink-3">
                    Evaluating font encodings, layout, sections, contact details, and dates
                  </p>
                </div>
              </div>
            ) : report ? (
              <Suspense fallback={<div className="py-8 text-center text-xs text-ink-3">Loading report view…</div>}>
                <AtsReportView report={report} fix={fix} />
              </Suspense>
            ) : (
              <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-line p-8 text-center">
                <div className="max-w-md">
                  <ScanText size={32} className="mx-auto mb-3 text-ink-3" />
                  <p className="text-sm font-medium">Ready to analyze</p>
                  <p className="mt-1.5 text-xs text-ink-3 leading-relaxed">
                    Upload any PDF resume or pick one from your library to examine how applicant tracking systems read
                    its fonts, margins, sections, and dates.
                  </p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
