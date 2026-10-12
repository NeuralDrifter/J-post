// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useCallback, useMemo } from 'react'
import type { ResumeData } from '../../lib/resumes/document'
import { CheckPageLayer, PageViewToggle } from './check/CheckPageLayer'
import { ParserView } from './check/ParserView'
import { FitChip } from './design/FitChip'
import { useMarkedChanges } from './ai/PageMarks'
import { VersionBanner } from './history/VersionBanner'
import { useResume } from './editorContext'
import { PreviewCanvas, type RenderedPreview } from './PreviewCanvas'
import { SelectionLayer } from './SelectionLayer'
import { useBuilderView } from './viewStore'
import type { Zoom } from './zoom'

/**
 * The resume's pages: click a block to edit it. While Check is open, its marks lie over them,
 * or the text a parser reads replaces them.
 */
/** A version from History, shown read-only instead of the resume as it is. */
export type ResumeVersion = { title: string; data: ResumeData }

export function ResumeCanvas({ zoom, checking, version }: { zoom: Zoom; checking: boolean; version?: ResumeVersion }) {
  const live = useWithPreviewedTemplate(useMarkedChanges(useResume()))
  const pageMap = useBuilderView((s) => s.rendered.pageMap)
  const pageView = useBuilderView((s) => s.pageView)
  const onRendered = useCallback(({ pdf, pageMap, pageCount }: RenderedPreview) => useBuilderView.getState().setRendered({ file: pdf, pageMap, pageCount }), [])
  const parser = checking && pageView === 'parser'
  if (version) return <VersionCanvas zoom={zoom} version={version} />
  return (
    <div className="relative min-h-0">
      <PreviewCanvas
        zoom={zoom}
        data={live}
        toolbar={
          <span className="flex flex-wrap items-center gap-2">
            {checking && <PageViewToggle />}
            <FitChip />
          </span>
        }
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

/** A past version on the page: read-only, so nothing on it can be picked or fixed. */
function VersionCanvas({ zoom, version }: { zoom: Zoom; version: ResumeVersion }) {
  return <PreviewCanvas zoom={zoom} data={version.data} toolbar={<VersionBanner title={version.title} />} />
}

/** The resume in the template hovered in the gallery, while one is. */
function useWithPreviewedTemplate(data: ResumeData): ResumeData {
  const template = useBuilderView((s) => s.previewTemplate)
  return useMemo(() => (template ? { ...data, metadata: { ...data.metadata, template } } : data), [data, template])
}
