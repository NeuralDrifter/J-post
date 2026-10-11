// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** Draws an on-screen SVG into a PNG at `scale`× (its colours must be plain values, not CSS variables). */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const { width, height } = svg.viewBox.baseVal
  const markup = new XMLSerializer().serializeToString(svg)
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This system cannot draw images')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be made'))), 'image/png'))
}
