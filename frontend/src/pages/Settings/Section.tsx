import type { ReactNode } from 'react'

export function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-ink-3">{hint}</p>
      {children}
    </section>
  )
}
