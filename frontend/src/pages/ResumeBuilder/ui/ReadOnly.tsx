// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react'

/** Disables every control inside while `when` holds, e.g. while a document is locked. */
export function ReadOnly({ when, children }: { when: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={when} className={`min-w-0 ${when ? 'opacity-70' : ''}`}>
      {children}
    </fieldset>
  )
}
