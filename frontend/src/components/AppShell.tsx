// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from './ErrorBoundary'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'

/** Workspaces that fill the window edge to edge and scroll their own panes. */
const FULL_BLEED = /^\/(resumes|letters)\/(?!check$)[^/]+$/

export function AppShell() {
  const location = useLocation()
  const fullBleed = FULL_BLEED.test(location.pathname)
  return (
    <div className="flex h-full">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className={fullBleed ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto px-4 py-4 min-[1100px]:px-8 min-[1100px]:py-6'}>
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
