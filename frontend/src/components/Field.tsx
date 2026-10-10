// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react'

/** A labelled form control; `wide` spans both columns of a two-column form. */
export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block space-y-1.5 ${wide ? 'col-span-2' : ''}`}>
      <span className="label-mono">{label}</span>
      {children}
    </label>
  )
}
