import type { ReactNode } from 'react'

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="bg-linear-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
