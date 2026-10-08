// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { FileText, FolderOpen, Paperclip, PenLine, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { confirmDialog, promptDialog } from '../../components/ConfirmDialog'
import { openMenu } from '../../lib/menu'
import { IconButton } from '../../components/IconButton'
import { Panel } from '../../components/Panel'
import { api, apiOk } from '../../lib/api'
import {
  DeleteAttachment,
  ListAttachments,
  OpenAttachment,
  PickAndAttachFile,
  RenameAttachment,
  ShowAttachmentInFolder,
  type app,
} from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { formatDate } from '../../lib/format'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

export function FilesPanel({ jobId }: { jobId: string }) {
  const { data: files } = useLoad(() => api(ListAttachments(jobId)), [jobId])

  const attach = async () => {
    const added = await api(PickAndAttachFile(jobId))
    if (!added) return // cancelled or failed (failure already toasted)
    notifyDataChanged()
    toast.success(`Attached ${added.fileName}`)
  }

  const remove = async (f: app.Attachment) => {
    const ok = await confirmDialog({
      title: 'Remove file?',
      message: `Remove ${f.label}? The copy stored by Job Track is deleted; your original file is not touched.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (ok && (await apiOk(DeleteAttachment(f.id)))) notifyDataChanged()
  }

  const rename = async (f: app.Attachment) => {
    const label = await promptDialog({ title: 'Rename file', label: 'Label', initial: f.label })
    if (label && label !== f.label && (await apiOk(RenameAttachment(f.id, label)))) notifyDataChanged()
  }

  return (
    <Panel
      title="Files"
      action={
        <IconButton label="Attach a file" onClick={attach}>
          <Paperclip size={15} />
        </IconButton>
      }
    >
      {files?.length ? (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Open', icon: SquareArrowOutUpRight, onSelect: () => apiOk(OpenAttachment(f.id)) },
                  { label: 'Show in folder', icon: FolderOpen, onSelect: () => apiOk(ShowAttachmentInFolder(f.id)) },
                  { label: 'Rename label…', icon: PenLine, onSelect: () => rename(f) },
                  'separator',
                  { label: 'Remove', icon: Trash2, danger: true, onSelect: () => remove(f) },
                ])
              }
            >
              <FileText size={16} className="shrink-0 text-ink-3" />
              <button className="min-w-0 flex-1 text-left" onClick={() => apiOk(OpenAttachment(f.id))} title={`Open ${f.fileName}`}>
                <p className="truncate text-sm hover:underline">{f.label}</p>
                <p className="truncate font-mono text-[11px] text-ink-3">
                  {f.label !== f.fileName ? `${f.fileName} · ` : ''}
                  {formatDate(f.addedAt)}
                </p>
              </button>
              <div className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label="Remove file" onClick={() => remove(f)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-3">Attach the resume and cover letter you sent, so you know exactly what they saw.</p>
      )}
    </Panel>
  )
}
