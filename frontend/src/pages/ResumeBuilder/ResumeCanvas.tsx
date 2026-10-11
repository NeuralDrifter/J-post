// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useCallback } from 'react'
import { CheckPageLayer, PageViewToggle } from './check/CheckPageLayer'
import { ParserView } from './check/ParserView'
import { useResume } from './editorContext'
import { PreviewCanvas, type RenderedPreview } from './PreviewCanvas'
import { SelectionLayer } from './SelectionLayer'
import { useBuilderView } from './viewStore'
import type { Zoom } from './zoom'

/**
 * The resume's pages: click a block to edit it. While Check is open, its marks lie over them,
 * or the text a parser reads replaces them.
 */
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
        pageLayer={(pageIndex) =>
          pageMap && (
            <>
              <SelectionLayer pageIndex={pageIndex} pageMap={pageMap} />
              {checking && <CheckPageLayer pageIndex={pageIndex} pageMap={pageMap} />}
            </>
          )
        }
        onRendered={onRendered}
      />
      {parser && (
        <div className="absolute inset-0 z-20 overflow-auto bg-void px-4 pb-8">
          <div className="sticky top-0 z-10 bg-void pt-3 pb-4">
            <PageViewToggle />
          </div>
          <ParserView />
        </div>
      )}
    </div>
  )
}
