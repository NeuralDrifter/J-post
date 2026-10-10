// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { templateLayouts, templateSchema, type Template } from '@reactive-resume/schema/templates'

export type { Template }

/** Every template, in Reactive Resume's order. */
export const TEMPLATES: readonly Template[] = templateSchema.options

const previewImages = import.meta.glob<string>('../../vendor/reactive-resume/web/templates/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** Reactive Resume's sample image of a template. */
export function templatePreview(template: Template): string {
  return previewImages[`../../vendor/reactive-resume/web/templates/${template}.jpg`] ?? ''
}

/** A short description of a template's layout, for the template picker. */
export function templateTraits(template: Template): string {
  const layout = templateLayouts[template]
  const columns = layout.columns === 1 ? 'One column' : `Two columns, sidebar ${layout.sidebarSide}`
  return layout.atsSafe ? `${columns} · ATS friendly` : columns
}

export function isTemplate(value: string): value is Template {
  return (TEMPLATES as readonly string[]).includes(value)
}
