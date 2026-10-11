// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// A document's history: autosaves per editing session, named versions, and
// restore. What it offers follows Reactive Resume's History tab (MIT).
import { useState, type MouseEvent, type SubmitEvent } from 'react'
import { History, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { confirmDialog, promptDialog } from '../../../components/ConfirmDialog'
import { api, apiOk } from '../../../lib/api'
import { DeleteDocumentVersion, GetDocumentVersion, ListDocumentVersions, NameDocumentVersion, RenameDocumentVersion, type app } from '../../../lib/backend'
import { formatDateTime, timeAgo } from '../../../lib/format'
import { openMenu } from '../../../lib/menu'
import { isNamedVersion, versionDetail, versionTitle } from '../../../lib/resumes/versions'
import { toast } from '../../../lib/toast'
import { useLoad } from '../../../lib/useLoad'

/** A version shown on the page instead of the document as it is now. */
export type PreviewedVersion = { id: string; title: string; data: string }

type Props = {
  docId: string
  previewed: PreviewedVersion | null
  onPreview: (version: PreviewedVersion | null) => void
  /** Saves pending edits, so a named version holds what's on screen. */
  flush: () => Promise<void>
  onRestore: (version: PreviewedVersion) => void
}

export function HistoryPanel({ docId, previewed, onPreview, flush, onRestore }: Props) {
  const [revision, setRevision] = useState(0)
  const refresh = () => setRevision((n) => n + 1)
  const { data: versions, loading } = useLoad(() => api(ListDocumentVersions(docId)), [docId, revision])

  const show = async (version: app.DocumentVersion) => {
    const full = await api(GetDocumentVersion(version.id))
    if (full) onPreview({ id: full.id, title: versionTitle(full), data: full.data })
  }

  return (
    <div className="space-y-3">
      <NameVersionForm docId={docId} flush={flush} onSaved={refresh} />
      {previewed && (
        <div className="space-y-2 rounded-2xl border border-accent/40 bg-accent/10 p-3">
          <p className="text-xs text-indigo-100">
            Showing <strong>{previewed.title}</strong> on the page. Restoring keeps what you have now as “Before restore”.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn btn-primary py-1 text-xs" onClick={() => onRestore(previewed)}>
              <RotateCcw size={13} /> Restore this version
            </button>
            <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => onPreview(null)}>
              Back to now
            </button>
          </div>
        </div>
      )}
      <ol aria-label="Versions" className="space-y-0.5">
        <TimelineItem title="Now" detail="The document as it is" selected={!previewed} current last={!versions?.length} onSelect={() => onPreview(null)} />
        {versions?.map((version, index) => (
          <TimelineItem
            key={version.id}
            title={versionTitle(version)}
            detail={`${timeAgo(version.createdAt)} · ${versionDetail(version.kind)}`}
            tooltip={formatDateTime(version.createdAt)}
            selected={previewed?.id === version.id}
            last={index === versions.length - 1}
            onSelect={() => void show(version)}
            onMenu={isNamedVersion(version) ? (e) => openMenu(e, namedVersionMenu(version, refresh)) : undefined}
          />
        ))}
      </ol>
      {!loading && (versions?.length ?? 0) <= 1 && <p className="text-xs text-ink-2">Only one version so far. Every editing session adds one automatically.</p>}
      <p className="text-[11px] text-ink-3">Autosaves are grouped by session and kept for 90 days. Named versions are kept until you delete them. Restoring saves the current state first.</p>
    </div>
  )
}

function NameVersionForm({ docId, flush, onSaved }: { docId: string; flush: () => Promise<void>; onSaved: () => void }) {
  const [name, setName] = useState('')
  const save = async (e: SubmitEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await flush()
    if (!(await api(NameDocumentVersion(docId, trimmed)))) return
    setName('')
    toast.success(`Saved “${trimmed}”`)
    onSaved()
  }
  return (
    <form className="flex gap-1.5" onSubmit={save}>
      <input className="field min-w-0 flex-1 py-1.5 text-xs" placeholder="Name this version, e.g. Sent to Lumen" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name this version" />
      <button type="submit" className="btn btn-primary py-1 text-xs" disabled={!name.trim()}>
        Save
      </button>
    </form>
  )
}

function namedVersionMenu(version: app.DocumentVersion, refresh: () => void) {
  const title = versionTitle(version)
  const rename = async () => {
    const name = (await promptDialog({ title: 'Rename version', label: 'Name', initial: version.name, confirmLabel: 'Rename' }))?.trim()
    if (name && name !== version.name && (await apiOk(RenameDocumentVersion(version.id, name)))) refresh()
  }
  const remove = async () => {
    const confirmed = await confirmDialog({ title: `Delete “${title}”?`, message: "Named versions are kept until you delete them. This can't be undone.", confirmLabel: 'Delete', danger: true })
    if (!confirmed || !(await apiOk(DeleteDocumentVersion(version.id)))) return
    toast.success(`Deleted “${title}”`)
    refresh()
  }
  return [
    { label: 'Rename…', icon: Pencil, onSelect: () => void rename() },
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => void remove() },
  ]
}

type TimelineItemProps = {
  title: string
  detail: string
  tooltip?: string
  selected: boolean
  last: boolean
  current?: boolean
  onSelect: () => void
  onMenu?: (e: MouseEvent) => void
}

function TimelineItem({ title, detail, tooltip, selected, last, current, onSelect, onMenu }: TimelineItemProps) {
  const dot = current ? 'bg-accent shadow-[0_0_10px_rgb(99_102_241/0.7)]' : selected ? 'bg-ink' : 'bg-line-strong'
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-2" onContextMenu={onMenu}>
      <span aria-hidden className="flex flex-col items-center">
        <span className={`mt-3.5 size-2.5 shrink-0 rounded-full ${dot}`} />
        {!last && <span className="w-px flex-1 bg-line" />}
      </span>
      <span className={`group flex items-start rounded-xl border transition ${selected ? 'border-line-strong bg-white/[0.04]' : 'border-transparent hover:bg-white/[0.03]'}`}>
        <button type="button" aria-pressed={selected} onClick={onSelect} title={tooltip} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left">
          <span className="flex max-w-full items-center gap-1.5 text-sm font-medium">
            {current && <History size={13} className="shrink-0 text-indigo-300" />}
            <span className="truncate">{title}</span>
          </span>
          <span className="text-[11px] text-ink-3">{detail}</span>
        </button>
        {onMenu && (
          <button type="button" onClick={onMenu} aria-label={`Options for ${title}`} className="m-1.5 grid size-7 place-items-center rounded-md text-ink-3 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-ink focus:opacity-100">
            <MoreHorizontal size={14} />
          </button>
        )}
      </span>
    </li>
  )
}
