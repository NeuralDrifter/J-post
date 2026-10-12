// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { MouseEvent } from 'react'
import { Check, RotateCcw, ShieldAlert, X } from 'lucide-react'
import { IconButton } from '../../../components/IconButton'
import { openMenu, type MenuEntry } from '../../../lib/menu'
import type { Change } from '../../../lib/resumes/ai/changes'
import { hasPlaceholder } from '../../../lib/resumes/ai/diff'
import { DiffText } from './DiffText'

const STATUS_NOTE = {
  accepted: { text: 'Accepted', className: 'text-emerald-300' },
  rejected: { text: 'Rejected', className: 'text-ink-3' },
  stale: { text: "You've edited this since, so it can't be applied", className: 'text-amber-300' },
} as const

type Props<T> = {
  change: Change<T>
  onAccept: () => void
  onReject: () => void
  onReopen: () => void
  /** Section-level entries for the right-click menu (Regenerate, Redo with). */
  sectionMenu: MenuEntry[]
}

/** One suggested change: where, the words in and out, why, and its own accept and reject. */
export function ChangeRow<T>({ change, onAccept, onReject, onReopen, sectionMenu }: Props<T>) {
  const pending = change.status === 'pending'
  const showMenu = (e: MouseEvent) =>
    openMenu(e, [
      { label: 'Accept', icon: Check, disabled: !pending, onSelect: onAccept },
      change.status === 'rejected' ? { label: 'Undo reject', icon: RotateCcw, onSelect: onReopen } : { label: 'Reject', icon: X, disabled: !pending, onSelect: onReject },
      ...(sectionMenu.length ? (['separator', ...sectionMenu] as MenuEntry[]) : []),
    ])

  return (
    <li className={`rounded-xl border border-line bg-white/[0.02] px-3 py-2 ${pending ? '' : 'opacity-70'}`} onContextMenu={showMenu}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-wide text-ink-3">{change.location}</p>
          <DiffText before={change.before} after={change.after} />
          {change.why && <p className="text-[11px] text-ink-2">{change.why}</p>}
          <Flags change={change} />
        </div>
        <div className="flex shrink-0 items-center">
          {pending ? (
            <>
              <IconButton label="Accept this change" onClick={onAccept}>
                <Check size={14} className="text-emerald-300" />
              </IconButton>
              <IconButton label="Reject this change" onClick={onReject}>
                <X size={14} className="text-rose-300" />
              </IconButton>
            </>
          ) : (
            change.status === 'rejected' && (
              <IconButton label="Undo reject" onClick={onReopen}>
                <RotateCcw size={13} />
              </IconButton>
            )
          )}
        </div>
      </div>
    </li>
  )
}

function Flags<T>({ change }: { change: Change<T> }) {
  const note = change.status === 'pending' ? null : STATUS_NOTE[change.status]
  const placeholder = hasPlaceholder(change.after)
  if (!note && !change.addsFacts && !placeholder) return null
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
      {note && <span className={note.className}>{note.text}</span>}
      {change.addsFacts && change.status === 'pending' && (
        <span className="flex items-center gap-1 text-amber-300">
          <ShieldAlert size={11} /> Adds something your resume didn't say. Check it's true.
        </span>
      )}
      {placeholder && change.status === 'pending' && <span className="text-amber-300">Fill in the highlighted figure after accepting.</span>}
    </p>
  )
}
