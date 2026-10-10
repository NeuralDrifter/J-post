// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Type } from 'lucide-react'
import { Chip } from '../../components/Chip'
import type { ResumeRenderOptions } from '@reactive-resume/pdf/context'
import type { ResumeData } from '../../lib/resumes/document'
import { closePdf, drawPage, openPdf, pageSize, type PdfDocument } from '../../lib/resumes/pdfjs'
import { renderResumePreview } from '../../lib/resumes/render'
import type { Zoom } from './zoom'

/** Re-render this long after the last change, so typing isn't slowed by rendering. */
const RENDER_DELAY_MS = 300
const PAGE_GAP_PX = 24
const CANVAS_PADDING_PX = 32

type Rendered = { doc: PdfDocument; pageCount: number; width: number; height: number; missingFonts: string[] }

/** A document's pages as they will print, re-rendered as it changes. */
export function PreviewCanvas({ zoom, data, renderOptions }: { zoom: Zoom; data: ResumeData; renderOptions?: ResumeRenderOptions }) {
  const { rendered, error, rendering } = useRenderedPdf(data, renderOptions)
  const container = useRef<HTMLDivElement>(null)
  const width = useWidth(container)
  const scale = !rendered ? 1 : zoom === 'fit' ? Math.max(0.2, (width - CANVAS_PADDING_PX * 2) / rendered.width) : zoom

  return (
    <div ref={container} className="relative h-full overflow-auto bg-void/60">
      <div className="sticky top-0 z-10 flex justify-end gap-2 px-4 pt-3">
        {rendering && (
          <Chip>
            <Loader2 size={11} className="animate-spin" /> Rendering
          </Chip>
        )}
        {rendered && rendered.missingFonts.length > 0 && (
          <Chip tone="warn" title="These fonts couldn't be downloaded; the preview uses a standard font instead. Export needs them.">
            <Type size={11} /> {rendered.missingFonts.join(', ')} unavailable offline
          </Chip>
        )}
      </div>
      {error && (
        <div role="alert" className="mx-auto mt-2 flex max-w-xl items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>The page couldn't be updated: {error}. Showing the last version that rendered.</span>
        </div>
      )}
      {rendered && (
        <div className="flex flex-col items-center" style={{ gap: PAGE_GAP_PX, padding: CANVAS_PADDING_PX }}>
          {Array.from({ length: rendered.pageCount }, (_, i) => (
            <PdfPage key={i} doc={rendered.doc} pageNumber={i + 1} pageCount={rendered.pageCount} width={rendered.width * scale} height={rendered.height * scale} scale={scale} />
          ))}
        </div>
      )}
    </div>
  )
}

function PdfPage({ doc, pageNumber, pageCount, width, height, scale }: { doc: PdfDocument; pageNumber: number; pageCount: number; width: number; height: number; scale: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvas.current) drawPage(doc, pageNumber, canvas.current, scale).catch(() => undefined) // a newer render replaces it anyway
  }, [doc, pageNumber, scale])
  return (
    <figure className="shrink-0">
      <canvas
        ref={canvas}
        style={{ width, height }}
        aria-label={`Page ${pageNumber} of ${pageCount}`}
        className="block rounded-sm bg-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8),0_0_40px_-10px_rgb(99_102_241/0.25)]"
      />
      {pageCount > 1 && <figcaption className="mt-1.5 text-center font-mono text-[10px] text-ink-3">{`${pageNumber} / ${pageCount}`}</figcaption>}
    </figure>
  )
}

/** Renders the resume after each pause in editing; a failed render keeps the previous one on screen. */
function useRenderedPdf(data: ResumeData, renderOptions: ResumeRenderOptions | undefined) {
  const [rendered, setRendered] = useState<Rendered>()
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const latest = useRef(0)
  const shown = useRef<PdfDocument | null>(null)

  // Release the document on screen when the editor closes.
  useEffect(() => () => void (shown.current && closePdf(shown.current)), [])

  useEffect(() => {
    const id = ++latest.current
    const timer = setTimeout(async () => {
      setRendering(true)
      try {
        const next = await renderToDocument(data, renderOptions)
        if (id !== latest.current) return closePdf(next.doc)
        if (shown.current) closePdf(shown.current)
        shown.current = next.doc
        setRendered(next)
        setError(null)
      } catch (err) {
        if (id === latest.current) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (id === latest.current) setRendering(false)
      }
    }, RENDER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [data, renderOptions])

  return { rendered, error, rendering }
}

async function renderToDocument(data: ResumeData, renderOptions: ResumeRenderOptions | undefined): Promise<Rendered> {
  const { pdf, missingFonts } = await renderResumePreview(data, renderOptions)
  const doc = await openPdf(pdf)
  const { width, height } = await pageSize(doc, 1)
  return { doc, pageCount: doc.numPages, width, height, missingFonts }
}

function useWidth(element: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!element.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [element])
  return width
}
