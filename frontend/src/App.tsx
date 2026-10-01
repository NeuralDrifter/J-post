import { HashRouter, Route, Routes, useParams } from 'react-router'
import { AppShell } from './components/AppShell'
import DiscoverPage from './pages/Discover/DiscoverPage'
import JobDetailPage from './pages/JobDetail/JobDetailPage'
import PipelinePage from './pages/Pipeline/PipelinePage'
import SettingsPage from './pages/Settings/SettingsPage'

// Remount the detail page per job so no state leaks between jobs.
function JobDetailRoute() {
  const { id = '' } = useParams()
  return <JobDetailPage key={id} id={id} />
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<PipelinePage />} />
          <Route path="jobs/:id" element={<JobDetailRoute />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
