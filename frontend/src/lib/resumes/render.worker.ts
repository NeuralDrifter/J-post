// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Renders resumes off the main thread, so typing in the builder never waits for a PDF.
import { renderPdfBytes, type RenderedPdf, type RenderRequest } from './renderCore'

export type WorkerRequest = RenderRequest & { id: number }
export type WorkerResponse = ({ id: number } & RenderedPdf) | { id: number; error: string }

self.addEventListener('message', async ({ data: request }: MessageEvent<WorkerRequest>) => {
  try {
    const rendered = await renderPdfBytes(request)
    self.postMessage({ id: request.id, ...rendered } satisfies WorkerResponse, { transfer: [rendered.pdf.buffer] })
  } catch (err) {
    self.postMessage({ id: request.id, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse)
  }
})
