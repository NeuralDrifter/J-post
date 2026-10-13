// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { TriangleAlert } from 'lucide-react'

export function StartupErrorScreen({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="glass max-w-xl rounded-3xl p-8">
        <div className="mb-4 flex items-center gap-3 text-warn">
          <TriangleAlert size={22} />
          <h1 className="text-xl font-bold text-ink">J-POST couldn't open your data</h1>
        </div>
        <p className="mb-4 text-sm text-ink-2">
          Nothing was deleted. Fix the problem below (or move the data folder aside) and restart the app.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-line bg-black/40 p-4 font-mono text-xs whitespace-pre-wrap text-rose-200">
          {message}
        </pre>
        <button className="btn btn-ghost mt-4" onClick={() => navigator.clipboard?.writeText(message)}>
          Copy error
        </button>
      </div>
    </div>
  )
}
