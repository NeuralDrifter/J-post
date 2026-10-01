import { Outlet } from 'react-router'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="flex h-full">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 min-[1100px]:px-8 min-[1100px]:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
