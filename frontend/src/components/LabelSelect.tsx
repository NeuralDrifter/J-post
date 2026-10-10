// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { SelectHTMLAttributes } from 'react'

type Props<K extends string> = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  labels: Record<K, string>
  values?: readonly K[] // which values to offer, in order; default: every key of labels
  empty?: string // label of a first "" option (not specified / any)
  value: string
  onChange: (value: string) => void
}

/** A dropdown of backend values shown by their labels (e.g. WORK_MODE_LABEL). */
export function LabelSelect<K extends string>({ labels, values, empty, value, onChange, className = 'field', ...rest }: Props<K>) {
  const offered = values ?? (Object.keys(labels) as K[])
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {empty !== undefined && <option value="">{empty}</option>}
      {offered.map((v) => (
        <option key={v} value={v}>
          {labels[v]}
        </option>
      ))}
    </select>
  )
}
