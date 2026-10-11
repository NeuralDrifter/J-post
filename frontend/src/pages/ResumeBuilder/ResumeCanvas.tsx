// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useCallback } from 'react'
import { CheckPageLayer, PageViewToggle } from './check/CheckPageLayer'
import { ParserView } from './check/ParserView'
import { useResume } from './editorContext'
import { PreviewCanvas, type RenderedPreview } from './PreviewCanvas'
import { useBuilderView } from './viewStore'
import type { Zoom } from './zoom'

/** The resume's pages, with Check's marks over them while Check is open, or the text a parser reads instead. */
export function ResumeCanvas({ zoom, checking }: { zoom: Zoom; checking: boolean }) {
  const data = useResume()
  const pageMap = useBuilderView((s) => s.rendered.pageMap)
  const pageView = useBuilderView((s) => s.pageView)
  const onRendered = useCallback(({ pdf, pageMap, pageCount }: RenderedPreview) => useBuilderView.getState().setRendered({ file: pdf, pageMap, pageCount }), [])
  const parser = checking && pageView === 'parser'
  return (
    <div className="relative min-h-0">
      <PreviewCanvas
        zoom={zoom}
        data={data}
        toolbar={checking && <PageViewToggle />}
        pageLayer={(pageIndex) => checking && pageMap && <CheckPageLayer pageIndex={pageIndex} pageMap={pageMap} />}
        onRendered={onRendered}
      />
      {parser && (
        <div className="absolute inset-0 overflow-auto bg-void/95 px-4 pb-8">
          <div className="sticky top-0 z-10 px-0 pt-3 pb-4">
            <PageViewToggle />
          </div>
          <ParserView />
        </div>
      )}
    </div>
  )
}
