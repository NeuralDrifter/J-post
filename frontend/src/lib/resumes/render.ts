// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Renders resumes to PDF in a Web Worker (render.worker.ts); if the worker
// can't start, on the main thread instead.
import type { ResumeData } from './document'
import type { RenderedPdf, RenderRequest } from './renderCore'
import type { WorkerRequest, WorkerResponse } from './render.worker'

/** A render for the screen. Missing fonts fall back to standard PDF fonts instead of failing. */
export type ResumePreview = { pdf: Blob; missingFonts: string[] }

type Pending = { request: RenderRequest; resolve: (rendered: RenderedPdf) => void; reject: (error: Error) => void }

const PDF_TYPE = 'application/pdf'
const pending = new Map<number, Pending>()
let nextId = 0
let worker: Worker | null | undefined

/** The PDF to export or send: refuses to finish if a font is missing or text was lost. */
export async function renderResumePdf(data: ResumeData): Promise<Blob> {
  const { pdf } = await render({ data, strict: true })
  return new Blob([pdf], { type: PDF_TYPE })
}

/** The PDF for the live preview and thumbnails, which should render offline too. */
export async function renderResumePreview(data: ResumeData): Promise<ResumePreview> {
  const { pdf, missingFonts } = await render({ data, strict: false })
  return { pdf: new Blob([pdf], { type: PDF_TYPE }), missingFonts }
}

function render(request: RenderRequest): Promise<RenderedPdf> {
  const target = getWorker()
  if (!target) return renderHere(request)
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { request, resolve, reject })
    target.postMessage({ ...request, id } satisfies WorkerRequest)
  })
}

async function renderHere(request: RenderRequest): Promise<RenderedPdf> {
  const { renderPdfBytes } = await import('./renderCore')
  return renderPdfBytes(request)
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'resume-pdf' })
  } catch {
    worker = null
    return worker
  }
  worker.addEventListener('message', ({ data: response }: MessageEvent<WorkerResponse>) => settle(response))
  worker.addEventListener('error', fallBackToMainThread)
  return worker
}

function settle(response: WorkerResponse) {
  const request = pending.get(response.id)
  if (!request) return
  pending.delete(response.id)
  if ('error' in response) request.reject(new Error(response.error))
  else request.resolve({ pdf: response.pdf, missingFonts: response.missingFonts })
}

/** Every render is caught inside the worker, so an error event means it couldn't start. */
function fallBackToMainThread() {
  worker?.terminate()
  worker = null
  for (const { request, resolve, reject } of pending.values()) renderHere(request).then(resolve, reject)
  pending.clear()
}
