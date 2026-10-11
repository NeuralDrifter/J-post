// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** Photos are stored inside the resume, so they're kept small: at most this many pixels on the long side. */
export const MAX_PHOTO_PIXELS = 512
const PHOTO_QUALITY = 0.9

export type CropArea = { x: number; y: number; width: number; height: number }

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** A size scaled down (never up) so its long side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** The whole image, uncropped, as a JPEG data URL no larger than MAX_PHOTO_PIXELS. */
export async function wholePhoto(source: string): Promise<string> {
  const image = await loadImage(source)
  return drawPhoto(image, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight })
}

/** The cropped part of an image as a JPEG data URL no larger than MAX_PHOTO_PIXELS. */
export async function cropPhoto(source: string, area: CropArea): Promise<string> {
  return drawPhoto(await loadImage(source), area)
}

function drawPhoto(image: HTMLImageElement, area: CropArea): string {
  const size = fitWithin(area.width, area.height, MAX_PHOTO_PIXELS)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This system cannot draw images')
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That file is not an image this app can read'))
    image.src = source
  })
}
