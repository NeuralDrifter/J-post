import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes, useParams } from 'react-router'
import { AppShell } from './components/AppShell'
import { ConfirmHost } from './components/ConfirmDialog'
import { ContextMenuHost } from './components/ContextMenu'
import { StartupErrorScreen } from './components/StartupErrorScreen'
import { Toaster } from './components/Toaster'
import { GetStartupError } from './lib/backend'
import DiscoverPage from './pages/Discover/DiscoverPage'
import JobDetailPage from './pages/JobDetail/JobDetailPage'
import OffersPage from './pages/Offers/OffersPage'
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
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
      <ConfirmHost />
      <ContextMenuHost />
    </HashRouter>
  )
}
