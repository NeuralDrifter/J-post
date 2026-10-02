import { Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from './ErrorBoundary'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'

export function AppShell() {
  const location = useLocation()
  return (
    <div className="flex h-full">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 min-[1100px]:px-8 min-[1100px]:py-6">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
