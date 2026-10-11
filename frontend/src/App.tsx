// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Route, Routes, useParams } from 'react-router'
import { AppShell } from './components/AppShell'
import { ConfirmHost } from './components/ConfirmDialog'
import { ContextMenuHost } from './components/ContextMenu'
import { StartupErrorScreen } from './components/StartupErrorScreen'
import { Toaster } from './components/Toaster'
import { errorMessage } from './lib/api'
import { GetStartupError } from './lib/backend'
import { toast } from './lib/toast'
import DiscoverPage from './pages/Discover/DiscoverPage'
import JobDetailPage from './pages/JobDetail/JobDetailPage'
import OffersPage from './pages/Offers/OffersPage'
import { InterviewReviewRoute } from './pages/Interview/InterviewReviewPage'
import InterviewsPage from './pages/Interviews/InterviewsPage'
import LiveInterviewPage from './pages/Interview/LiveInterviewPage'
import PipelinePage from './pages/Pipeline/PipelinePage'
import SettingsPage from './pages/Settings/SettingsPage'

// Loaded on demand: it carries every license text (~440 KB).
const LicensesPage = lazy(() => import('./pages/Licenses/LicensesPage'))
// Loaded on demand: they carry the PDF engine, templates and editors.
const ResumesPage = lazy(() => import('./pages/Resumes/ResumesPage'))
const AtsCheckerPage = lazy(() => import('./pages/AtsChecker/AtsCheckerPage'))
const ResumeBuilderPage = lazy(() => import('./pages/ResumeBuilder/ResumeBuilderPage'))
const LetterWriterPage = lazy(() => import('./pages/Letters/LetterWriterPage'))
const InsightsPage = lazy(() => import('./pages/Insights/InsightsPage'))

// Remount the detail page per job so no state leaks between jobs.
function JobDetailRoute() {
  const { id = '' } = useParams()
  return <JobDetailPage key={id} id={id} />
}

function Lazy({ page }: { page: ReactNode }) {
  return <Suspense fallback={null}>{page}</Suspense>
}

export default function App() {
  const [startupError, setStartupError] = useState<string | null>(null)
  useEffect(() => {
    GetStartupError().then(setStartupError, (err: unknown) => setStartupError(String(err)))
  }, [])

  // Background failures (rejected promises) become toasts instead of failing silently.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => toast.error(`Unexpected error: ${errorMessage(e.reason)}`)
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  if (startupError === null) return null
  if (startupError !== '') return <StartupErrorScreen message={startupError} />
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<PipelinePage />} />
          <Route path="jobs/:id" element={<JobDetailRoute />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="offers" element={<OffersPage />} />
          <Route path="insights" element={<Lazy page={<InsightsPage />} />} />
          <Route path="interviews" element={<InterviewsPage />} />
          <Route path="interviews/:id/live" element={<LiveInterviewPage />} />
          <Route path="interviews/:id" element={<InterviewReviewRoute />} />
          <Route path="resumes" element={<Lazy page={<ResumesPage />} />} />
          <Route path="resumes/check" element={<Lazy page={<AtsCheckerPage />} />} />
          <Route path="resumes/:id" element={<Lazy page={<ResumeBuilderPage />} />} />
          <Route path="letters/:id" element={<Lazy page={<LetterWriterPage />} />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="licenses" element={<Lazy page={<LicensesPage />} />} />
        </Route>
      </Routes>
      <Toaster />
      <ConfirmHost />
      <ContextMenuHost />
    </HashRouter>
  )
}
