import type { ReactNode } from 'react'

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`glass rounded-2xl p-4 ${className}`}>
      <header className="mb-3 flex min-h-7 items-center justify-between gap-2">
        <h3 className="label-mono">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}
