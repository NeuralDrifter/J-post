// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

type State = { error: Error | null }

/** Shows what broke instead of a blank page; resets when you navigate (via key). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const details = `${error.name}: ${error.message}\n${error.stack ?? ''}`
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="glass max-w-xl rounded-3xl p-6">
          <div className="mb-3 flex items-center gap-2 text-warn">
            <TriangleAlert size={20} />
            <h1 className="text-lg font-bold text-ink">This page hit an error</h1>
          </div>
          <p className="mb-3 text-sm text-ink-2">Your data is safe. Copy the details below if you're reporting it, then go back or reload.</p>
          <pre className="max-h-48 overflow-auto rounded-xl border border-line bg-black/40 p-3 font-mono text-[11px] whitespace-pre-wrap text-rose-200">{details}</pre>
          <div className="mt-4 flex gap-2">
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(details)}>
              Copy details
            </button>
            <button className="btn btn-ghost" onClick={() => history.back()}>
              Go back
            </button>
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
