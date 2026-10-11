// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { Columns2, LoaderCircle } from 'lucide-react'
import { renderResumePreview } from '../../../lib/resumes/render'
import { useEditor, useResume } from '../editorContext'
import { useEditWithUndo } from '../useEditWithUndo'
import { useBuilderView } from '../viewStore'
import { fitDesign, overflowOf } from './fit'

const countPages = async (candidate: Parameters<typeof renderResumePreview>[0]) => (await renderResumePreview(candidate)).pageMap.pages.length

/** "Runs onto page 2", over the page while the resume runs past its pages, with Fit to tighten it. */
export function FitChip() {
  const data = useResume()
  const locked = useEditor((s) => s.locked)
  const printedPages = useBuilderView((s) => s.rendered.pageCount)
  const editWithUndo = useEditWithUndo()
  const [fitting, setFitting] = useState(false)
  const overflow = overflowOf(data, printedPages)
  if (!overflow) return null

  const fit = async () => {
    setFitting(true)
    try {
      const { metadata, fits } = await fitDesign(data, countPages)
      if (metadata !== data.metadata) editWithUndo((d) => void (d.metadata = metadata), fits ? 'Fitted by tightening the spacing and text' : 'Tightened as far as it goes; it still runs over')
    } finally {
      setFitting(false)
    }
  }
  const target = overflow.authored === 1 ? 'one page' : `${overflow.authored} pages`
  return (
    <span className="flex items-center gap-2 rounded-xl border border-warn/40 bg-raised/90 py-1 pr-1 pl-2.5 text-xs text-amber-200 shadow-lg backdrop-blur">
      <Columns2 size={13} /> Runs onto page {overflow.authored + 1}
      <button type="button" className="btn btn-ghost py-0.5 text-xs" disabled={fitting || locked} onClick={() => void fit()}>
        {fitting && <LoaderCircle size={12} className="animate-spin" />} Fit to {target}
      </button>
    </span>
  )
}
