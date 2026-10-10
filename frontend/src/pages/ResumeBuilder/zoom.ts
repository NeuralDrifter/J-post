// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** "fit" scales the page to the canvas width; a number is CSS pixels per PDF point. */
export type Zoom = 'fit' | number

const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
/** What "fit" counts as when stepping from it. */
const FIT_EQUIVALENT = 1

const current = (zoom: Zoom) => (zoom === 'fit' ? FIT_EQUIVALENT : zoom)

export function zoomIn(zoom: Zoom): Zoom {
  return STEPS.find((step) => step > current(zoom)) ?? STEPS.at(-1)!
}

export function zoomOut(zoom: Zoom): Zoom {
  return [...STEPS].reverse().find((step) => step < current(zoom)) ?? STEPS[0]
}

export function zoomLabel(zoom: Zoom): string {
  return zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`
}
