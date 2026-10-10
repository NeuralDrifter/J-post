// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Runs Reactive Resume's PDF renderer (Forme, WebAssembly). It is shared by the
// render worker and by render.ts's fallback when a worker can't start.
import wasmUrl from '@formepdf/core/pkg-web/forme_bg.wasm?url'
import * as forme from '@formepdf/core/worker'
import { assertPdfText, renderResume } from '@reactive-resume/pdf/forme/render'
import { parseResumeData } from '@reactive-resume/schema/resume/data'

/**
 * strict: the PDF is for export, so it fails if a font is missing or text was lost.
 * Otherwise (the screen) missing fonts fall back to the standard PDF fonts.
 */
export type RenderRequest = { data: unknown; strict: boolean }
export type RenderedPdf = { pdf: Uint8Array<ArrayBuffer>; missingFonts: string[] }

export async function renderPdfBytes({ data, strict }: RenderRequest): Promise<RenderedPdf> {
  // init downloads the engine with the first render, not with the app, and is a no-op afterwards.
  await forme.init(wasmUrl)
  const result = await renderResume(forme, { data: parseResumeData(data) })
  if (strict) assertPdfText(result)
  return { pdf: result.pdf as Uint8Array<ArrayBuffer>, missingFonts: result.missingFonts }
}
