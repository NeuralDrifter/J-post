import { useEffect, useState } from 'react'
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
import InterviewReviewPage from './pages/Interview/InterviewReviewPage'
import LiveInterviewPage from './pages/Interview/LiveInterviewPage'
import PipelinePage from './pages/Pipeline/PipelinePage'
import SettingsPage from './pages/Settings/SettingsPage'

// Remount the detail page per job so no state leaks between jobs.
function JobDetailRoute() {
  const { id = '' } = useParams()
  return <JobDetailPage key={id} id={id} />
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
          <Route path="interviews/:id/live" element={<LiveInterviewPage />} />
          <Route path="interviews/:id" element={<InterviewReviewPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
      <ConfirmHost />
      <ContextMenuHost />
    </HashRouter>
  )
}
