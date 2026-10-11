// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { History } from 'lucide-react'

/** Over the page while History previews a version: the page shows that version, read-only. */
export function VersionBanner({ title }: { title: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-xl border border-accent/40 bg-raised/90 px-2.5 py-1 text-xs text-indigo-100 shadow-lg backdrop-blur">
      <History size={13} /> Viewing “{title}” · read only
    </span>
  )
}
