// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { NavLink, useLocation } from 'react-router'
import { BadgeDollarSign, ChartNoAxesColumn, FileText, Mic, Search, Settings, SquareKanban } from 'lucide-react'

// `also`: other paths that belong to the item, e.g. letters live under Resumes.
const ITEMS = [
  { to: '/', label: 'Pipeline', icon: SquareKanban, end: true, also: [] },
  { to: '/discover', label: 'Discover', icon: Search, end: false, also: [] },
  { to: '/resumes', label: 'Resumes', icon: FileText, end: false, also: ['/letters'] },
  { to: '/offers', label: 'Offers', icon: BadgeDollarSign, end: false, also: [] },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn, end: false, also: [] },
  { to: '/interviews', label: 'Interviews', icon: Mic, end: false, also: [] },
  { to: '/settings', label: 'Settings', icon: Settings, end: false, also: [] },
]

const FULL_BLEED = /^\/(resumes|letters)\/(?!check$)[^/]+$/

export function NavRail() {
  const { pathname } = useLocation()
  const fullBleed = FULL_BLEED.test(pathname)
  return (
    <nav className={`flex w-16 shrink-0 flex-col border-r border-line bg-base/60 py-4 ${fullBleed ? '' : 'min-[1100px]:w-56'}`}>
      <div className="mb-6 flex items-center gap-2.5 px-4">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-accent to-info font-mono text-xs font-bold text-white shadow-lg shadow-accent/30">
          JT
        </div>
        <span className={fullBleed ? 'hidden' : 'hidden text-lg font-bold tracking-tight min-[1100px]:inline'}>J-POST</span>
      </div>
      {ITEMS.map(({ to, label, icon: Icon, end, also }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={label}
          className={({ isActive }) =>
            `mx-2 mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive || also.some((path) => pathname.startsWith(path)) ? 'bg-accent/20 text-ink shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-ink-2 hover:bg-white/5 hover:text-ink'
            }`
          }
        >
          <Icon size={18} className="shrink-0" />
          <span className={fullBleed ? 'hidden' : 'hidden min-[1100px]:inline'}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
