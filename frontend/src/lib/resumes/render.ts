// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The only module that runs Reactive Resume's PDF renderer (Forme, WebAssembly).
import wasmUrl from '@formepdf/core/pkg-web/forme_bg.wasm?url'
import * as forme from '@formepdf/core/worker'
import { createResumePdfBlob } from '@reactive-resume/pdf/browser'
import { renderResume } from '@reactive-resume/pdf/forme/render'
import type { ResumeData } from './document'

/** A render for the screen. Missing fonts fall back to standard PDF fonts instead of failing. */
export type ResumePreview = { pdf: Blob; missingFonts: string[] }

const PDF_TYPE = 'application/pdf'

/** The PDF to export or send: refuses to finish if a font is missing or text was lost. */
export function renderResumePdf(data: ResumeData): Promise<Blob> {
  return createResumePdfBlob({ data })
}

/** The PDF for the live preview and thumbnails, which should render offline too. */
export async function renderResumePreview(data: ResumeData): Promise<ResumePreview> {
  // init downloads the engine with the first render, not with the app, and is a no-op afterwards.
  await forme.init(wasmUrl)
  const { pdf, missingFonts } = await renderResume(forme, { data })
  return { pdf: new Blob([pdf as Uint8Array<ArrayBuffer>], { type: PDF_TYPE }), missingFonts }
}
