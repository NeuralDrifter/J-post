// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The only module that talks to PDF.js: it paints rendered resumes onto canvases.
import { AnnotationMode, GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = PDFDocumentProxy

/** PDF points per CSS pixel is 1:1 at scale 1; this sharpens the bitmap on high-density screens. */
const MIN_BITMAP_SCALE = 2

/** Opens a rendered PDF; release it with closePdf when it is replaced. */
export async function openPdf(pdf: Blob): Promise<PdfDocument> {
  return getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise
}

export function closePdf(doc: PdfDocument): void {
  void doc.loadingTask.destroy()
}

/** A page's size in PDF points. */
export async function pageSize(doc: PdfDocument, pageNumber: number): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber)
  const { width, height } = page.getViewport({ scale: 1 })
  return { width, height }
}

/**
 * Draws one page into canvas at `scale` CSS pixels per PDF point. It paints off-screen first, so the canvas
 * never shows a blank frame between renders.
 */
export async function drawPage(doc: PdfDocument, pageNumber: number, canvas: HTMLCanvasElement, scale: number): Promise<void> {
  const page = await doc.getPage(pageNumber)
  try {
    const viewport = page.getViewport({ scale })
    const bitmapScale = Math.max(MIN_BITMAP_SCALE, window.devicePixelRatio || 1)
    const buffer = document.createElement('canvas')
    buffer.width = Math.floor(viewport.width * bitmapScale)
    buffer.height = Math.floor(viewport.height * bitmapScale)
    await page.render({
      canvas: buffer,
      viewport,
      transform: [bitmapScale, 0, 0, bitmapScale, 0, 0],
      annotationMode: AnnotationMode.DISABLE,
      background: 'white',
    }).promise
    canvas.width = buffer.width
    canvas.height = buffer.height
    canvas.getContext('2d')?.drawImage(buffer, 0, 0)
  } finally {
    page.cleanup()
  }
}

/** The first page as a JPEG data URL, `width` CSS pixels wide, for library cards. */
export async function firstPageImage(pdf: Blob, width: number): Promise<string> {
  const doc = await openPdf(pdf)
  try {
    const { width: pageWidth } = await pageSize(doc, 1)
    const canvas = document.createElement('canvas')
    await drawPage(doc, 1, canvas, width / pageWidth)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    closePdf(doc)
  }
}
