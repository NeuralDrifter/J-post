// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { MouseEvent } from 'react'
import { Star } from 'lucide-react'
import { Chip } from '../../components/Chip'
import type { app } from '../../lib/backend'
import { timeAgo } from '../../lib/format'
import { templateLabel, templateOf } from '../../lib/resumes/library'
import { isTemplate, templatePreview } from '../../lib/resumes/templates'
import { useThumbnail } from '../../lib/resumes/thumbnails'

type Props = {
  doc: app.Document
  isDefault: boolean
  dimmed?: boolean
  /** Shown before the template, e.g. which kind of document it is in Trash. */
  label?: string
  onOpen?: () => void
  onContextMenu: (e: MouseEvent) => void
}

/** A resume or letter in the library: its first page, name, template and when it last changed. */
export function DocumentCard({ doc, isDefault, dimmed = false, label, onOpen, onContextMenu }: Props) {
  const template = templateOf(doc)
  return (
    <article
      onContextMenu={onContextMenu}
      className={`group glass flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_-12px_rgb(99_102_241/0.35)] ${dimmed ? 'opacity-70' : ''}`}
    >
      <button type="button" onClick={onOpen ?? ((e) => onContextMenu(e))} className="relative block text-left" aria-label={`Open ${doc.name}`}>
        <Thumbnail doc={doc} template={template} />
        {isDefault && (
          <span className="absolute top-2 left-2">
            <Chip tone="accent">
              <Star size={11} className="fill-current" /> Default
            </Chip>
          </span>
        )}
      </button>
      <div className="min-w-0 border-t border-line px-3 py-2.5">
        <p className="truncate text-sm font-semibold" title={doc.name}>
          {doc.name}
        </p>
        <p className="truncate font-mono text-[11px] text-ink-3">
          {[label, templateLabel(template), `edited ${timeAgo(doc.updatedAt)}`].filter(Boolean).join(' · ')}
        </p>
      </div>
    </article>
  )
}

/** The rendered first page; until it's ready, the template's sample page, faded. */
function Thumbnail({ doc, template }: { doc: app.Document; template: string }) {
  const rendered = useThumbnail(doc)
  const placeholder = isTemplate(template) ? templatePreview(template) : ''
  const src = rendered ?? placeholder
  return (
    <div className="aspect-[1/1.414] w-full overflow-hidden bg-white/95">
      {src && <img src={src} alt="" className={`h-full w-full object-cover object-top transition-opacity ${rendered ? 'opacity-100' : 'opacity-30'}`} />}
    </div>
  )
}
