// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** How long the hidden print frame stays, so the print dialog can finish reading the PDF. */
const PRINT_FRAME_MS = 60_000

/**
 * Opens the system print dialog for a PDF, through a hidden frame (as Reactive Resume prints).
 * Where the frame can't print, the PDF opens on its own to print from there.
 */
export function printPdf(pdf: Blob): void {
  const url = URL.createObjectURL(pdf)
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      window.open(url, '_blank', 'noopener')
    }
    setTimeout(() => {
      frame.remove()
      URL.revokeObjectURL(url)
    }, PRINT_FRAME_MS)
  }
  document.body.appendChild(frame)
}
