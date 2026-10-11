// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { MouseEvent, ReactNode } from 'react'

export function IconButton({ label, onClick, disabled = false, children }: { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-md text-ink-2 transition hover:bg-white/10 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}
